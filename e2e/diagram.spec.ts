// A slate's setup diagram (#87), on the sample project: slate 42A's cameras place themselves with
// their lens and field of view, one is moved and turned, a light and a measurement are added, the
// diagram is kept, and the wrap package holds it as an image. Role and label selectors only.
// Every test starts on an empty device.
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { entryBlob, readZip } from '../src/lib/store/zipRead';
import { expect, openApp, test } from './fixtures';

const cover = (page: Page) => page.getByRole('dialog', { name: 'Setup Diagram, Slate 42A' });
const canvas = (page: Page) => page.getByRole('img', { name: 'Setup diagram of slate 42A' });
const tool = (page: Page, name: string) => cover(page).getByRole('radio', { name });

async function open42A(page: Page) {
	await openApp(page, '/slates');
	await page.getByRole('link', { name: /^42A/ }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
}

/** The diagrams kept on the device, as the store holds them. */
const stored = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<{ shapes: { kind: string; symbol?: string; setupId?: string; rotation?: number; at?: { x: number; y: number } }[] }[]>((resolve) => {
				const open = indexedDB.open('sg-onset');
				open.onsuccess = () => {
					const db = open.result;
					const all = db.transaction('diagram').objectStore('diagram').getAll();
					all.onsuccess = () => {
						resolve(all.result);
						db.close();
					};
				};
			})
	);

/** A point of the canvas in screen pixels, from drawing units (the sheet is 1600 by 1200). */
async function screen(page: Page, x: number, y: number): Promise<[number, number]> {
	const box = (await canvas(page).boundingBox())!;
	return [box.x + (x * box.width) / 1600, box.y + (y * box.height) / 1200];
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
	await page.mouse.move(...from);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
	await page.mouse.up();
}

test.describe('setup diagram', () => {
	test('places the slate’s cameras with their lens and view, moves and turns one, adds a light and a length, keeps it, and exports it', async ({ page }, testInfo) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
			Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
		});
		await open42A(page);
		const row = page.getByRole('button', { name: /^Setup Diagram/ });
		await expect(row).toContainText('Not drawn');
		await row.tap();
		await expect(cover(page)).toBeVisible();

		// Camera A of the sample: an ALEXA 35 with the S4/i 32 mm, 27.99 mm wide: 47° across.
		await expect(canvas(page).getByText('S4/i 32 mm T2')).toBeVisible();
		await expect(canvas(page).getByText('32 mm · 47°')).toBeVisible();
		expect(await stored(page)).toEqual([]);

		// Move camera A. Slate 42A has cameras A and B: they stand a third and two thirds across, near the foot.
		await drag(page, await screen(page, 1600 / 3, 960), await screen(page, 1600 / 3 - 300, 560));
		await expect.poll(async () => (await stored(page))[0]?.shapes.find((s) => s.setupId)?.at?.y).toBeLessThan(960 - 300);

		// Turn it to face right, by the dot in front of it.
		const at = (await stored(page))[0].shapes.find((s) => s.setupId)!.at!;
		const handle = await screen(page, at.x, at.y - 48 * 1.6);
		await drag(page, handle, await screen(page, at.x + 300, at.y));
		// To the degree a pixel allows.
		await expect.poll(async () => Math.abs(((await stored(page))[0].shapes.find((s) => s.setupId)?.rotation ?? 0) - 90)).toBeLessThanOrEqual(2);

		// A light, then a measurement from the camera to it.
		await tool(page, 'Light').tap();
		await page.mouse.click(...(await screen(page, 1200, 300)));
		await expect.poll(async () => (await stored(page))[0].shapes.filter((s) => s.symbol === 'light')).toHaveLength(1);
		await tool(page, 'Measure').tap();
		await drag(page, await screen(page, at.x, at.y + 120), await screen(page, 1200, 420));
		const value = page.getByRole('dialog', { name: 'Measurement' });
		await value.getByRole('textbox', { name: 'Length' }).fill('4 m');
		await value.getByRole('button', { name: 'Done' }).tap();
		await expect(canvas(page).getByText('4 m', { exact: true })).toBeVisible();

		// A camera of the slate cannot be deleted: it would place itself again.
		await tool(page, 'Move').tap();
		await page.mouse.click(...(await screen(page, 1500, 1150)));
		await expect(cover(page).getByRole('button', { name: 'Delete' })).toBeDisabled();
		const moved = (await stored(page))[0].shapes.find((s) => s.setupId)!.at!;
		await page.mouse.click(...(await screen(page, moved.x, moved.y)));
		await expect(cover(page).getByRole('button', { name: 'Delete' })).toBeDisabled();
		// The light can.
		await page.mouse.click(...(await screen(page, 1200, 300)));
		await expect(cover(page).getByRole('button', { name: 'Delete' })).toBeEnabled();

		await cover(page).getByRole('button', { name: 'Done' }).tap();
		await expect(cover(page)).toHaveCount(0);
		await expect(row).toContainText('Drawn');

		// Kept on the slate.
		await page.reload();
		await page.getByRole('button', { name: /^Setup Diagram/ }).tap();
		await expect(canvas(page).getByText('4 m', { exact: true })).toBeVisible();
		await cover(page).getByRole('button', { name: 'Done' }).tap();

		// In the wrap package as an image.
		await page.goto('/wrap');
		await page.getByRole('button', { name: 'Make Wrap Package' }).tap();
		const save = page.getByRole('button', { name: 'Download Wrap Package' });
		await expect(save).toBeVisible();
		const [download] = await Promise.all([page.waitForEvent('download'), save.tap()]);
		const zip = new Blob([await readFile((await download.path())!)]);
		const entries = await readZip(zip);
		const image = entries.find((e) => e.name.endsWith('/diagrams/42A-setup-diagram.png'));
		expect(image, entries.map((e) => e.name).join('\n')).toBeDefined();
		const png = Buffer.from(await (await entryBlob(zip, image!)).arrayBuffer());
		expect(png.subarray(1, 4).toString()).toBe('PNG');
		await testInfo.attach('setup diagram', { body: png, contentType: 'image/png' });
	});
});
