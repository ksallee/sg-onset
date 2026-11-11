// Wrap on the sample project: the day summary, a missing value opening its take on Shoot, the
// wrap package built and read back, the download and share hand-overs, the print view. Role and
// label selectors only. Every test starts on an empty device.
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { readZip, entryBlob } from '../src/lib/store/zipRead';
import { expect, openApp, test } from './fixtures';

/** No share sheet: the hand-over is a download. */
async function noShare(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
		Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
	});
}

/** A share sheet that takes files and keeps what it was given. */
async function fakeShare(page: Page) {
	await page.addInitScript(() => {
		const shared: { name: string; size: number; type: string }[] = [];
		(window as unknown as { shared: typeof shared }).shared = shared;
		Object.defineProperty(navigator, 'canShare', { value: (d: ShareData) => !!d.files?.length, configurable: true });
		Object.defineProperty(navigator, 'share', {
			value: async (d: ShareData) => {
				for (const f of d.files ?? []) shared.push({ name: f.name, size: f.size, type: f.type });
			},
			configurable: true
		});
	});
}

const summary = (page: Page) => page.getByRole('list', { name: 'The day' }).or(page.locator('dl[aria-label="The day"]'));

test.describe('wrap', () => {
	test('sums up the day of the sample project', async ({ page }) => {
		await openApp(page, '/wrap');
		await expect(page.getByRole('heading', { name: 'Wrap', level: 1 })).toBeVisible();
		const values = summary(page).getByRole('definition');
		await expect(values).toHaveText(['2', '6', '2', '0', '0', /min$/]);
		await expect(page.getByText('Camera A')).toBeVisible();
		await expect(page.getByText('Camera B')).toBeVisible();
		await expect(page.getByText('Not exported yet')).toBeVisible();
		await expect(page.getByRole('button', { name: /^Nothing to fix/ }).or(page.getByText('Nothing to fix'))).toBeVisible();
	});

	test('a take with no end time is a to-do that opens the take on Shoot', async ({ page }) => {
		await openApp(page, '/shoot');
		// The slate picked before, if any, gives way to 42B (as take.spec.ts does).
		const pick = page.getByRole('button', { name: /^Slate 42B(?!,)\b/ });
		const change = page.getByRole('button', { name: /^Change Slate/ });
		await expect(pick.or(change).first()).toBeVisible();
		if (await change.count()) await change.tap();
		await pick.tap();
		const start = page.getByRole('toolbar', { name: 'Capture' }).getByRole('button', { name: /^Start\b/ });
		await start.tap();
		await expect(page.getByRole('toolbar', { name: 'Capture' }).getByRole('button', { name: /^End\b/ })).toBeVisible();
		// Away from the slate, so the to-do has to bring it back.
		await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Wrap' }).tap();
		const todo = page.getByRole('button', { name: /^Slate 42B, take 2 · A\b.*No end time/ });
		await expect(todo).toBeVisible();
		await todo.tap();
		await expect(page).toHaveURL(/\/shoot\?take=/);
		await expect(page).toHaveTitle(/42B\/2/);
	});

	test('builds the wrap package, downloads it, and the zip holds the files with the VES header', async ({ page }) => {
		await noShare(page);
		await openApp(page, '/wrap');
		await page.getByRole('button', { name: 'Make Wrap Package' }).tap();
		const save = page.getByRole('button', { name: 'Download Wrap Package' });
		await expect(save).toBeVisible();
		const [download] = await Promise.all([page.waitForEvent('download'), save.tap()]);
		const name = download.suggestedFilename();
		expect(name).toMatch(/^Sample-project_\d{4}-\d{2}-\d{2}-day02\.zip$/);
		const root = name.replace(/\.zip$/, '');
		const bytes = await readFile((await download.path())!);
		const zip = new Blob([bytes]);
		const entries = await readZip(zip);
		expect(entries.map((e) => e.name)).toEqual([
			`${root}/${root}_camera-report.csv`,
			`${root}/${root}_all-fields.csv`,
			`${root}/${root}_editorial.ale`,
			`${root}/${root}_data.json`,
			`${root}/${root}_day-report.html`
		]);
		const crif = await (await entryBlob(zip, entries[0])).text();
		expect(crif.split('\r\n')[0]).toMatch(/^"Job","CRIF Version","Unique Slate ID","SlatesUUID","Slate","Camera Letter",/);
		expect(crif.split('\r\n').filter(Boolean)).toHaveLength(7);
		await expect(page.getByText(/^Exported today \d{2}:\d{2}$/)).toBeVisible();
	});

	test('hands the package to the share sheet where there is one', async ({ page }) => {
		await fakeShare(page);
		await openApp(page, '/wrap');
		await page.getByRole('switch', { name: 'Photos' }).uncheck();
		await page.getByRole('button', { name: 'Make Wrap Package' }).tap();
		await page.getByRole('button', { name: 'Share Wrap Package' }).tap();
		await expect(page.getByRole('status').filter({ hasText: 'Handed over.' })).toBeVisible();
		const shared = await page.evaluate(() => (window as unknown as { shared: { name: string; type: string }[] }).shared);
		expect(shared).toHaveLength(1);
		expect(shared[0]).toMatchObject({ type: 'application/zip' });
		expect(shared[0].name).toMatch(/\.zip$/);
	});

	test('previews the camera report', async ({ page }) => {
		await openApp(page, '/wrap');
		await page.getByRole('button', { name: 'More for Camera report (VES CSV)' }).tap();
		await page.getByRole('menuitem', { name: 'Preview' }).tap();
		const sheet = page.getByRole('dialog', { name: /Preview: Camera report/ });
		await expect(sheet.getByRole('columnheader', { name: 'CRIF Version' })).toBeVisible();
		await expect(sheet.getByText('First 6 of 6 rows.')).toBeVisible();
	});

	test('shows the printable day report and prints it', async ({ page }) => {
		await openApp(page, '/wrap');
		await page.evaluate(() => {
			(window as unknown as { printed: number }).printed = 0;
			window.print = () => void ((window as unknown as { printed: number }).printed += 1);
		});
		await page.getByRole('link', { name: /^Day Report/ }).tap();
		await expect(page).toHaveURL(/\/wrap\/report\?days=/);
		await expect(page.getByRole('heading', { name: 'Sample project', level: 1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Slate 42A' }).first()).toBeVisible();
		await page.getByRole('button', { name: 'Print' }).tap();
		expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
	});
});
