// Drawing on a photo (#86), on stored data: the sample project, slate 42A. A photo is taken, drawn
// on, given a text and a measurement; the drawing is kept beside the photo, and the wrap package
// holds the photo and its annotated copy. Role and label selectors only. Every test starts on an
// empty device.
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { entryBlob, readZip } from '../src/lib/store/zipRead';
import { expect, openApp, test } from './fixtures';

const rail = (page: Page) => page.getByRole('toolbar', { name: 'Capture' });
const cover = (page: Page) => page.getByRole('dialog', { name: /^Photo 1 of Take / });
const canvas = (page: Page) => page.getByRole('img', { name: 'Photo 1 and its drawing' });
const tool = (page: Page, name: string) => cover(page).getByRole('radio', { name });

/** Shoot on slate 42A of the sample. */
async function openShoot(page: Page) {
	await openApp(page, '/shoot');
	const pick = page.getByRole('button', { name: /^Slate 42A(?!,)\b/ });
	const change = page.getByRole('button', { name: /^Change Slate/ });
	await expect(pick.or(change).first()).toBeVisible();
	if (await change.count()) {
		if ((await change.getAttribute('aria-label'))?.endsWith(' 42A')) return;
		await change.tap();
	}
	await pick.tap();
	await expect(rail(page)).toBeVisible();
}

/** A 400 by 300 PNG, made by the browser. */
async function picture(page: Page): Promise<Buffer> {
	const base64 = await page.evaluate(() => {
		const c = document.createElement('canvas');
		c.width = 400;
		c.height = 300;
		const g = c.getContext('2d')!;
		g.fillStyle = '#4a7a5a';
		g.fillRect(0, 0, 400, 300);
		return c.toDataURL('image/png').split(',')[1];
	});
	return Buffer.from(base64, 'base64');
}

/** A drag across the canvas, from and to fractions of its box. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
	const box = (await canvas(page).boundingBox())!;
	const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
	await page.mouse.move(...at(from));
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) await page.mouse.move(at(from)[0] + ((at(to)[0] - at(from)[0]) * i) / 8, at(from)[1] + ((at(to)[1] - at(from)[1]) * i) / 8);
	await page.mouse.up();
}

/** The files of the device, as the store keeps them: what is annotated. */
const annotatedFiles = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				const open = indexedDB.open('sg-onset');
				open.onsuccess = () => {
					const db = open.result;
					const all = db.transaction('blobs').objectStore('blobs').getAll();
					all.onsuccess = () => {
						resolve((all.result as { variant?: string }[]).filter((b) => b.variant === 'annotated').length);
						db.close();
					};
				};
			})
	);

test.describe('drawing on a photo', () => {
	test('draws, writes and measures on a photo, keeps it, and hands over the photo with its annotated copy', async ({ page, browserName }, testInfo) => {
		// Playwright's WebKit runs in an ephemeral session whose IndexedDB refuses Blobs, so no photo
		// is stored there (take.spec.ts). The drawing needs a stored photo.
		test.skip(browserName === 'webkit', 'No stored photo in an ephemeral WebKit session');
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
			Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
		});
		await openShoot(page);
		const png = await picture(page);
		const [chooser] = await Promise.all([page.waitForEvent('filechooser'), rail(page).getByRole('button', { name: 'Photo' }).tap()]);
		await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
		const open = page.getByRole('button', { name: 'Draw on photo 1' });
		await expect(open).toBeEnabled();
		await open.tap();
		await expect(cover(page)).toBeVisible();
		await expect(canvas(page)).toBeVisible();
		await expect(tool(page, 'Draw')).toHaveAttribute('aria-checked', 'true');

		// A line, taken back and done again.
		const undo = cover(page).getByRole('button', { name: 'Undo' });
		const redo = cover(page).getByRole('button', { name: 'Redo' });
		await expect(undo).toBeDisabled();
		await drag(page, [0.2, 0.2], [0.6, 0.4]);
		await expect(undo).toBeEnabled();
		await undo.tap();
		await expect(redo).toBeEnabled();
		await expect(undo).toBeDisabled();
		await redo.tap();
		await expect(undo).toBeEnabled();

		// A dimension line, then its length.
		await tool(page, 'Measure').tap();
		await drag(page, [0.1, 0.8], [0.9, 0.8]);
		const value = page.getByRole('dialog', { name: 'Measurement' });
		await expect(value).toBeVisible();
		await value.getByRole('textbox', { name: 'Length' }).fill('far');
		await value.getByRole('button', { name: 'Done' }).tap();
		await expect(value.getByRole('alert')).toHaveText('Type a length: 2.5 m, or 8\' 2".');
		await value.getByRole('textbox', { name: 'Length' }).fill('2.5 m');
		await value.getByRole('button', { name: 'Done' }).tap();
		await expect(canvas(page).getByText('2.5 m')).toBeVisible();

		// A text.
		await tool(page, 'Text').tap();
		const box = (await canvas(page).boundingBox())!;
		await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
		const words = page.getByRole('dialog', { name: 'Text' });
		await expect(words).toBeVisible();
		await words.getByRole('textbox', { name: 'Text' }).fill('Grey ball');
		await words.getByRole('button', { name: 'Done' }).tap();
		await expect(canvas(page).getByText('Grey ball')).toBeVisible();

		await cover(page).getByRole('button', { name: 'Done' }).tap();
		await expect(cover(page)).toHaveCount(0);

		// Kept beside the photo: back after a reload.
		await page.reload();
		await page.getByRole('button', { name: 'Draw on photo 1' }).tap();
		await expect(canvas(page).getByText('Grey ball')).toBeVisible();
		await expect(canvas(page).getByText('2.5 m')).toBeVisible();
		await cover(page).getByRole('button', { name: 'Done' }).tap();

		// The annotated copy is made once the drawing closes, then goes in the wrap package beside the photo.
		await expect.poll(() => annotatedFiles(page), { timeout: 10_000 }).toBe(1);
		await page.goto('/wrap');
		await page.getByRole('button', { name: 'Make Wrap Package' }).tap();
		const save = page.getByRole('button', { name: 'Download Wrap Package' });
		await expect(save).toBeVisible();
		const [download] = await Promise.all([page.waitForEvent('download'), save.tap()]);
		const zip = new Blob([await readFile((await download.path())!)]);
		const entries = (await readZip(zip)).filter((e) => e.name.includes('/photos/'));
		const photos = entries.map((e) => e.name);
		expect(photos).toHaveLength(2);
		expect(photos[0]).toMatch(/\/photos\/42A\/take-\d+\/42A-A-reference-(\d+)\.png$/);
		expect(photos[1]).toBe(photos[0].replace(/\.png$/, '-annotated.jpg'));
		// The copy for the report, to look at.
		const copy = Buffer.from(await (await entryBlob(zip, entries[1])).arrayBuffer());
		expect(copy.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
		await testInfo.attach('annotated copy', { body: copy, contentType: 'image/jpeg' });
	});
});
