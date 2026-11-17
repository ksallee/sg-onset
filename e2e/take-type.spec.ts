// The take type (#92) on stored data, slate 42A of the sample: typed with one tap on the take
// sheet and shown on the take row. A clean plate turns the slate's Clean plate on. When the take
// leaves the type, the notice says the switch stays on and offers Turn Off; ignored, it stays on.
// The plates at the tail (#108), under Type, count as types for the switches.
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

const rail = (page: Page) => page.getByRole('toolbar', { name: 'Capture' });
const notice = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

/** Shoot on slate 42A of the sample, whatever was picked before. */
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

/** Types take 3 on the take sheet. */
async function typeTake(page: Page, type: string) {
	await page.getByRole('button', { name: /^(Add Note|Note:)/ }).first().tap();
	const sheet = page.getByRole('dialog', { name: 'Take 3' });
	await sheet.getByRole('button', { name: type, exact: true }).tap();
	await sheet.getByRole('button', { name: 'Done' }).tap();
	await expect(sheet).toBeHidden();
}

/** Puts a plate at the tail of take 3 on the take sheet, or takes it off. */
async function tailTake(page: Page, tail: string) {
	await page.getByRole('button', { name: /^(Add Note|Note:)/ }).first().tap();
	const sheet = page.getByRole('dialog', { name: 'Take 3' });
	await sheet.getByRole('button', { name: `${tail} at the tail` }).tap();
	await sheet.getByRole('button', { name: 'Done' }).tap();
	await expect(sheet).toBeHidden();
}

const takeRow = (page: Page, name: string) => page.getByRole('navigation', { name: 'Takes' }).getByRole('button', { name, exact: true });

/** The Clean plate switch of slate 42A, on the slate's page. */
async function cleanPlate(page: Page) {
	await openApp(page, '/slates');
	await page.getByRole('link', { name: /^42A/ }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
	return page.getByRole('switch', { name: 'Clean plate' });
}

test('a clean plate take turns the slate switch on; retyped, the notice offers Turn Off', async ({ page }) => {
	await expect(await cleanPlate(page)).not.toBeChecked();

	await openShoot(page);
	await typeTake(page, 'Clean plate');
	await expect(notice(page, 'Take 3 set to Clean plate. Slate 42A: Clean plate on')).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Takes' }).getByRole('button', { name: 'Slate 42A, take 3, Clean plate' })).toBeVisible();
	await expect(await cleanPlate(page)).toBeChecked();

	await openShoot(page);
	await typeTake(page, 'Main');
	const offer = notice(page, 'Slate 42A: Clean plate stays on');
	await offer.getByRole('button', { name: 'Turn Off' }).tap();
	await expect(notice(page, 'Slate 42A: Clean plate turned off')).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Takes' }).getByRole('button', { name: 'Slate 42A, take 3' })).toBeVisible();
	await expect(await cleanPlate(page)).not.toBeChecked();
});

test('ignoring the offer leaves the switch on', async ({ page }) => {
	await openShoot(page);
	await typeTake(page, 'Clean plate');
	await typeTake(page, 'Shadow plate');
	await expect(notice(page, 'Slate 42A: Clean plate stays on').getByRole('button', { name: 'Turn Off' })).toBeVisible();
	await expect(await cleanPlate(page)).toBeChecked();
});

test('bulk edit types many takes; set back to Main, one notice offers the lighting setup switches', async ({ page }) => {
	await openApp(page, '/slates');
	await page.getByRole('link', { name: /^42A/ }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
	await page.waitForFunction(() => !document.documentElement.dataset.nav);
	await page.getByRole('checkbox', { name: 'Select take 1, A' }).tap();
	await page.getByRole('button', { name: 'Select All' }).tap();

	const edit = async (type: string) => {
		await page.getByRole('toolbar').getByRole('button', { name: 'Edit' }).tap();
		const sheet = page.getByRole('dialog', { name: 'Edit 5 Takes' });
		await sheet.getByRole('button', { name: /^Type/ }).tap();
		await sheet.getByRole('combobox', { name: 'Type' }).selectOption({ label: type });
		await sheet.getByRole('button', { name: 'Set on 5 Takes' }).tap();
		await expect(sheet).toBeHidden();
	};

	// The sample's Street, dusk has the balls on already: only the chart turns on.
	await edit('Balls and chart');
	await expect(notice(page, 'Type set on 5 takes. Lighting setup Street, dusk: Colour chart on')).toBeVisible();
	await expect(page.getByRole('table', { name: 'Takes' }).getByText('Balls and chart')).toHaveCount(5);

	await edit('Main');
	await notice(page, 'Lighting setup Street, dusk: Grey and chrome balls, Colour chart stay on').getByRole('button', { name: 'Turn Off' }).tap();
	await expect(notice(page, 'Lighting setup Street, dusk: Grey and chrome balls, Colour chart turned off')).toBeVisible();
	await expect(page.getByRole('table', { name: 'Takes' }).getByText('Balls and chart')).toHaveCount(0);
});

test('a clean plate at the tail turns the slate switch on; taken off, the notice offers Turn Off', async ({ page }) => {
	await openShoot(page);
	await tailTake(page, 'Clean plate');
	await expect(notice(page, 'Clean plate added to the tail of take 3. Slate 42A: Clean plate on')).toBeVisible();
	await expect(takeRow(page, 'Slate 42A, take 3, Clean plate tail')).toBeVisible();
	await expect(await cleanPlate(page)).toBeChecked();

	await openShoot(page);
	await tailTake(page, 'Clean plate');
	await notice(page, 'Slate 42A: Clean plate stays on').getByRole('button', { name: 'Turn Off' }).tap();
	await expect(notice(page, 'Slate 42A: Clean plate turned off')).toBeVisible();
	await expect(takeRow(page, 'Slate 42A, take 3')).toBeVisible();
	await expect(await cleanPlate(page)).not.toBeChecked();
});

test('the type and the tail both hold the switch: leaving the type offers nothing while the tail holds it', async ({ page }) => {
	await openShoot(page);
	await typeTake(page, 'Clean plate');
	await tailTake(page, 'Clean plate');
	await tailTake(page, 'Balls and chart');
	// The sample's Street, dusk has the balls on already: only the chart turns on.
	await expect(notice(page, 'Balls and chart added to the tail of take 3. Lighting setup Street, dusk: Colour chart on')).toBeVisible();
	await expect(takeRow(page, 'Slate 42A, take 3, Clean plate, Clean plate tail, Balls and chart tail')).toBeVisible();

	await typeTake(page, 'Main');
	await expect(notice(page, 'Take 3 set to Main').getByRole('button', { name: 'Undo' })).toBeVisible();
	await expect(takeRow(page, 'Slate 42A, take 3, Clean plate tail, Balls and chart tail')).toBeVisible();
	await expect(await cleanPlate(page)).toBeChecked();
});

test('a take opened from the slate puts a plate at its tail with a chip; the table shows it beside the type', async ({ page }) => {
	await openApp(page, '/slates');
	await page.getByRole('link', { name: /^42A/ }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
	await page.waitForFunction(() => !document.documentElement.dataset.nav);
	await page.getByRole('button', { name: 'Open take 1 A' }).tap();
	const sheet = page.getByRole('dialog', { name: 'Take 1 · A' });
	const tail = sheet.getByRole('group', { name: 'At the tail' });
	await tail.getByRole('button', { name: 'Balls and chart' }).tap();
	await expect(notice(page, 'At the tail changed. Lighting setup Street, dusk: Colour chart on')).toBeVisible();
	await expect(tail.getByRole('button', { name: 'Balls and chart' })).toHaveAttribute('aria-pressed', 'true');
	await expect(tail.getByRole('button', { name: 'Clean plate' })).toHaveAttribute('aria-pressed', 'false');
	await sheet.getByRole('button', { name: 'Done' }).tap();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('table', { name: 'Takes' }).getByText('Balls and chart tail')).toHaveCount(1);
});
