// Gear: cameras, lenses, camera setups and CSV import, on the sample project. Every target: on
// a phone width an entry opens on its own page, with Back to the list.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

/** Back to the list where the entry has a page of its own; nothing to do beside it. */
async function toList(page: Page) {
	const back = page.getByRole('button', { name: 'Gear', exact: true });
	if (await back.isVisible()) await back.tap();
	await expect(page.getByRole('button', { name: 'Add Lens' })).toBeVisible();
}

const detail = (page: Page, name: string) => page.getByRole('heading', { name, level: 2, exact: true });

test('adds a camera and a lens, edits them, and they survive a reload', async ({ page }) => {
	await openApp(page, '/gear');

	await page.getByRole('button', { name: 'Add Camera', exact: true }).tap();
	const cam = page.getByRole('dialog', { name: 'New Camera' });
	await cam.getByRole('textbox', { name: 'Model' }).fill('Venice 2');
	await cam.getByRole('textbox', { name: 'Serial number' }).fill('V2-77');
	await cam.getByRole('textbox', { name: 'Sensor size' }).fill('35.9 x 24');
	await page.getByRole('button', { name: 'Create' }).tap();
	await expect(detail(page, 'Venice 2')).toBeVisible();
	await expect(page.getByText('35.9 × 24 mm · SN V2-77').first()).toBeVisible();

	await toList(page);
	await page.getByRole('button', { name: 'Add Lens' }).tap();
	const lens = page.getByRole('dialog', { name: 'New Lens' });
	await lens.getByRole('textbox', { name: 'Make' }).fill('Zeiss');
	await lens.getByRole('textbox', { name: 'Model' }).fill('Supreme 29');
	await lens.getByRole('textbox', { name: 'Focal length' }).fill('29');
	await page.getByRole('button', { name: 'Create' }).tap();
	await expect(detail(page, 'Zeiss Supreme 29')).toBeVisible();
	await expect(page.getByText('A prime. Takes on this lens get 29 mm from it.')).toBeVisible();

	// A long end makes it a zoom; a long end under the short end is refused and not saved.
	const longEnd = page.getByRole('textbox', { name: 'Long end' });
	await longEnd.fill('80');
	await longEnd.press('Enter');
	await expect(page.getByText('A zoom, 29–80 mm. The focal length is typed on each take.')).toBeVisible();
	await longEnd.fill('12');
	await longEnd.press('Enter');
	await expect(page.getByRole('alert')).toHaveText(/^The long end/);

	await page.reload();
	await expect(detail(page, 'Zeiss Supreme 29')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Long end' })).toHaveValue('80');
	await toList(page);
	await expect(page.getByRole('button', { name: /^Sony|^Venice 2/ })).toBeVisible();
});

test('makes a camera setup and swaps its lens in two taps', async ({ page }) => {
	await openApp(page, '/gear');
	await page.getByRole('button', { name: 'Add Camera Setup' }).tap();
	const sheet = page.getByRole('dialog', { name: 'New Camera Setup' });
	await expect(sheet.getByRole('textbox', { name: 'Camera letter' })).toHaveValue('C');
	await page.getByRole('button', { name: 'Create' }).tap();
	await expect(detail(page, 'C')).toBeVisible();
	await expect(page.getByText('Takes already shot keep the camera and lens they were shot with.').first()).toBeVisible();
	await toList(page);

	// Two taps: the lens button, the lens.
	await page.getByRole('button', { name: 'Change the lens of A' }).tap();
	const picker = page.getByRole('dialog', { name: 'Lens for A' });
	await picker.getByRole('button', { name: /^Cooke S4\/i 50 mm T2/ }).tap();
	await expect(picker).toBeHidden();
	await expect(page.getByRole('button', { name: 'Change the lens of A' })).toHaveText('50 mm');
	await expect(page.getByRole('status').filter({ hasText: 'A: Cooke S4/i 50 mm T2' })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('button', { name: 'Change the lens of A' })).toHaveText('50 mm');
});

/** The camera letters of the setups, in list order. */
async function setupOrder(page: Page): Promise<string[]> {
	const names = await page.getByRole('button', { name: /^Change the lens of / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
	return names.map((n) => n.replace('Change the lens of ', ''));
}

test('moves camera setups by grip, arrow keys and Move Up; one undo each; kept on reload', async ({ page }) => {
	await openApp(page, '/gear');
	await expect.poll(() => setupOrder(page)).toEqual(['A', 'B']);

	// Drag B's grip above A.
	const grip = page.getByRole('button', { name: 'Move B' });
	const a = await page.getByRole('button', { name: 'Move A' }).boundingBox();
	const b = (await grip.boundingBox())!;
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
	await page.mouse.down();
	await page.mouse.move(b.x + b.width / 2, a!.y + 4, { steps: 8 });
	await page.mouse.up();
	await expect.poll(() => setupOrder(page)).toEqual(['B', 'A']);
	await expect(page.getByRole('status').filter({ hasText: 'B moved to place 1' })).toBeVisible();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect.poll(() => setupOrder(page)).toEqual(['A', 'B']);

	// The arrow keys on the grip, and focus stays on it.
	await page.getByRole('button', { name: 'Move A' }).focus();
	await page.keyboard.press('ArrowDown');
	await expect.poll(() => setupOrder(page)).toEqual(['B', 'A']);
	await expect(page.getByRole('button', { name: 'Move A' })).toBeFocused();

	// Move Up on the setup itself.
	await page.getByRole('button', { name: /^A\b/ }).first().tap();
	await page.getByRole('button', { name: 'Move Up' }).tap();
	await expect(page.getByText('Place 1 of 2.', { exact: false })).toBeVisible();
	await toList(page);
	await expect.poll(() => setupOrder(page)).toEqual(['A', 'B']);

	await page.getByRole('button', { name: 'Move A' }).focus();
	await page.keyboard.press('ArrowDown');
	await expect(page.getByRole('status').filter({ hasText: 'A moved to place 2' })).toBeVisible();
	await page.reload();
	await expect.poll(() => setupOrder(page)).toEqual(['B', 'A']);
});

test('shows the whole Anamorphic squeeze label, whatever the width', async ({ page }) => {
	await openApp(page, '/gear');
	await page.getByRole('button', { name: 'Add Lens' }).tap();
	const sheet = page.getByRole('dialog', { name: 'New Lens' });
	const label = sheet.getByText('Anamorphic squeeze', { exact: true });
	const box = await label.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
	expect(box.scroll).toBeLessThanOrEqual(box.client);
});

const CSV = ['Make,Model,Serial,Focal,Colour', 'Zeiss,Supreme 25,Z25-1,25,red', ',,X2,50,', 'Zeiss,Supreme 35,Z35-1,wide,', 'Cooke,S4/i 32 mm T2,,32,'].join('\n');

test('imports lenses from CSV: a preview first, one undo for all', async ({ page }) => {
	await openApp(page, '/gear/import?kind=lens');
	await page.getByRole('textbox', { name: 'Pasted text' }).fill(CSV);

	await expect(page.getByText('No model. The row was left out.')).toBeVisible();
	await expect(page.getByText('Focal: “wide” could not be read. The value was left out.', { exact: true })).toBeVisible();
	await expect(page.getByText(/^Already in this project · Skipped/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Colour' })).toHaveCount(0);
	await expect(page.getByText('Not read: Colour')).toBeVisible();

	await page.getByRole('button', { name: 'Import 2 Lenses' }).tap();
	await expect(page).toHaveURL(/\/gear$/);
	await expect(page.getByRole('button', { name: /^Zeiss Supreme 25/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Zeiss Supreme 35/ })).toBeVisible();

	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect(page.getByRole('button', { name: /^Zeiss Supreme 25/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Zeiss Supreme 35/ })).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Add Lens' })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Zeiss Supreme/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Cooke S4\/i 32 mm T2/ })).toHaveCount(1);
});

for (const [kind, file, count] of [
	['camera', 'sg-onset-cameras-sample.csv', 'Import 2 Cameras'],
	['lens', 'sg-onset-lenses-sample.csv', 'Import 4 Lenses']
] as const) {
	test(`offers a ${kind} sample CSV that the paste box shows and that imports cleanly`, async ({ page }) => {
		await openApp(page, `/gear/import?kind=${kind}`);
		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download a Sample CSV' }).tap()]);
		expect(download.suggestedFilename()).toBe(file);
		const sample = readFileSync((await download.path())!, 'utf8');

		// The paste box shows the sample's header and its first rows.
		const box = page.getByRole('textbox', { name: 'Pasted text' });
		const placeholder = (await box.getAttribute('placeholder')) ?? '';
		expect(placeholder.split('\n')[0]).toBe(sample.split('\n')[0]);
		expect(sample.startsWith(placeholder)).toBe(true);

		// Pasted as it is, every row is ready.
		await box.fill(sample);
		await expect(page.getByRole('button', { name: count })).toBeEnabled();
		await expect(page.getByText('With a value left out')).toHaveCount(0);
		await expect(page.getByText('Not read:', { exact: false })).toHaveCount(0);
	});
}

test('the library adds a body and a whole lens set as one edit, and marks what the project has', async ({ page }) => {
	await openApp(page, '/gear');
	await page.getByRole('button', { name: 'Add from Library' }).first().tap();
	const library = page.getByRole('dialog', { name: 'Gear Library' });
	await library.getByRole('searchbox').fill('venice 2 8k');
	await library.getByRole('button', { name: /^VENICE 2 8K/ }).tap();

	await library.getByRole('radio', { name: 'Lenses' }).tap();
	await library.getByRole('searchbox').fill('signature prime');
	await library.getByRole('button', { name: /^ARRI Signature Prime/ }).tap();
	await library.getByRole('button', { name: 'Whole Set, 16 Lenses' }).tap();
	await expect(library.getByText('16 picked')).toBeVisible();
	await library.getByRole('button', { name: 'Add 17' }).tap();
	await expect(library).toBeHidden();

	await expect(page.getByRole('button', { name: /^Sony VENICE 2 8K/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Signature Prime 47 mm/ })).toBeVisible();

	// One Undo takes the seventeen back.
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect(page.getByRole('button', { name: /Signature Prime 47 mm/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Sony VENICE 2 8K/ })).toHaveCount(0);

	// Added again, the body survives a reload, and the library says the project has it.
	await page.getByRole('button', { name: 'Add from Library' }).first().tap();
	await library.getByRole('searchbox').fill('venice 2 8k');
	await library.getByRole('button', { name: /^VENICE 2 8K/ }).tap();
	await library.getByRole('button', { name: 'Add 1' }).tap();
	await expect(library).toBeHidden();
	await page.reload();
	await expect(page.getByRole('button', { name: /^Sony VENICE 2 8K/ })).toBeVisible();
	await page.getByRole('button', { name: 'Add from Library' }).first().tap();
	await library.getByRole('searchbox').fill('venice 2 8k');
	await expect(library.getByRole('listitem').filter({ hasText: 'VENICE 2 8K' }).getByText('In the project')).toBeVisible();
});
