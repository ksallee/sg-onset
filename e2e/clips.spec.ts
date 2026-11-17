// The DIT's clips on real stored data (the sample project, today's day: 42A and 42B): an ALE in
// Silverstack's shape is imported from a file, its clips matched to the takes by time of day and
// by roll and order, one left-over clip put on a take by hand, the import applied, undone and done
// again.
import type { Page } from '@playwright/test';
import { silverstackAle, type TestClip } from '../src/lib/clips/testFiles';
import { auditLayout } from './audit';
import { expect, openApp, test } from './fixtures';

const ZONE = 'Europe/Paris';
test.use({ timezoneId: ZONE });

/** The sample times today's takes back from now, 4 minutes apart: 42A A1, B1, A2, B2, A3, then 42B A1 (lib/app/sample.ts). */
const AGO = { a1: 83, b1: 79, a2: 75, b2: 71, a3: 67, b42: 63 };

/** Time of day timecode at 24 fps, in the device's zone, `seconds` after `ms`. */
function tod(ms: number, seconds = 0): string {
	const parts = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(ms + seconds * 1000));
	return `${parts}:00`;
}

function dayAle(now: number): string {
	const at = (minutes: number) => now - minutes * 60_000;
	const clip = (name: string, start: number, extra: Partial<TestClip> = {}): TestClip => ({ name, roll: name.slice(0, 4), camera: name.slice(0, 1), start: tod(start, -2), end: tod(start, 46), ...extra });
	return silverstackAle([
		clip('A001C001_261117_S8XY', at(AGO.a1)),
		clip('B001C001_261117_K1PZ', at(AGO.b1)),
		clip('A001C002_261117_S8XY', at(AGO.a2)),
		clip('B001C002_261117_K1PZ', at(AGO.b2)),
		// Two minutes off take 3's Start: no match by time, so by roll and order.
		clip('A001C003_261117_S8XY', at(AGO.a3) + 120_000),
		// No roll, no camera, no time of day: left over until it is picked.
		{ name: 'PICKUP_0001', start: '01:00:00:00', end: '01:00:20:00' }
	]);
}

async function chooseFile(page: Page, text: string) {
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /^Choose an ALE or CSV File/ }).tap()]);
	await chooser.setFiles({ name: 'DAY02_A001_B001.ale', mimeType: 'text/plain', buffer: Buffer.from(text) });
}

async function clipNameOf(page: Page, take: string) {
	await page.getByRole('button', { name: `Open take ${take}` }).tap();
	const sheet = page.getByRole('dialog', { name: `Take ${take.replace(' ', ' · ')}` });
	const value = await sheet.getByRole('textbox', { name: 'Clip name' }).inputValue();
	await sheet.getByRole('button', { name: 'Done' }).tap();
	await expect(sheet).toBeHidden();
	return value;
}

test('an ALE fills clip names on the day’s takes, one match fixed by hand, one undo takes it back', async ({ page }) => {
	await openApp(page, '/slates');
	const now = Date.now();
	await page.getByRole('link', { name: /^Import Clips/ }).tap();
	await expect(page.getByRole('heading', { name: 'Import Clips', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Nothing to Fill' })).toBeDisabled();

	await chooseFile(page, dayAle(now));
	await expect(page.getByText('DAY02_A001_B001.ale')).toBeVisible();
	// The columns, known by their Silverstack names: Name is column 29, CamRoll column 3.
	await expect(page.getByRole('combobox', { name: 'Clip name' })).toHaveValue('28');
	await expect(page.getByRole('combobox', { name: 'Camera roll' })).toHaveValue('2');

	const matches = page.getByRole('list').filter({ has: page.getByRole('button', { name: /^A001C001/ }) });
	await expect(matches.getByRole('button', { name: /^A001C001_261117_S8XY.*Slate 42A, take 1 · A · By time of day/ })).toBeVisible();
	await expect(matches.getByRole('button', { name: /^B001C002_261117_K1PZ.*Slate 42A, take 2 · B · By time of day/ })).toBeVisible();
	await expect(matches.getByRole('button', { name: /^A001C003_261117_S8XY.*Slate 42A, take 3 · A · By roll and order/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /^PICKUP_0001.*01:00:00:00 to 01:00:19:23/ })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Fill 5 Takes' })).toBeEnabled();
	await auditLayout(page, test.info(), '/slates/import with a file');

	// The left-over clip goes on 42B take 1, picked by hand.
	await page.getByRole('button', { name: /^PICKUP_0001/ }).tap();
	const picker = page.getByRole('dialog', { name: 'PICKUP_0001' });
	await picker.getByRole('button', { name: /^Take 1 · A/ }).last().tap();
	await expect(picker).toBeHidden();
	await expect(page.getByRole('button', { name: /^PICKUP_0001.*Slate 42B, take 1 · A · Picked/ })).toBeVisible();
	await page.getByRole('button', { name: 'Fill 6 Takes' }).tap();

	await expect(page).toHaveURL(/\/slates$/);
	// One undo, from the notice, takes the whole import back.
	await expect(page.getByRole('status').filter({ hasText: 'Clips imported on 6 takes' })).toBeVisible();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect(page.getByRole('status').filter({ hasText: 'Undone' })).toBeVisible();
	await page.getByRole('link', { name: /^42A/ }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
	expect(await clipNameOf(page, '1 A')).toBe('');

	// Done again, the takes hold the clips.
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect.poll(() => clipNameOf(page, '1 A')).toBe('A001C001_261117_S8XY');
	expect(await clipNameOf(page, '3 A')).toBe('A001C003_261117_S8XY');
});
