// Slates and bulk edit on real stored data (the sample project): five takes selected and edited
// at once, undone as one, persisted across a reload; a drag down the selection column; the list's
// filters; duplicate and delete.
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

const circle = (page: Page, take: string, camera: string) => page.getByRole('checkbox', { name: `Select take ${take}, ${camera}` });
/** What the selected takes hold in a field, as the bulk edit sheet says: the value, or Mixed. */
async function holds(page: Page, field: string, value: string) {
	await page.getByRole('toolbar').getByRole('button', { name: 'Edit' }).tap();
	const sheet = page.getByRole('dialog', { name: /^Edit \d+ Takes?$/ });
	await expect(sheet.getByRole('button', { name: new RegExp(`^${field}`) })).toHaveAccessibleName(new RegExp(`^${field} ${value}$`));
	await sheet.getByRole('button', { name: 'Done' }).tap();
	await expect(sheet).toBeHidden();
}
/** Until a push or pop has finished: a page still sliding in is not where it lands. */
const settled = (page: Page) => page.waitForFunction(() => !document.documentElement.dataset.nav);

async function open42A(page: Page) {
	await openApp(page, '/slates');
	await page.getByRole('link', { name: /^42A/ }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
	await settled(page);
}

test('bulk edit sets a field on five takes, one undo takes it back, and it survives a reload', async ({ page }) => {
	await open42A(page);
	await circle(page, '1', 'A').tap();
	await page.getByRole('button', { name: 'Range' }).tap();
	await circle(page, '3', 'A').tap();
	await expect(page.getByRole('toolbar', { name: '5 selected' })).toBeVisible();

	await page.getByRole('toolbar').getByRole('button', { name: 'Edit' }).tap();
	const sheet = page.getByRole('dialog', { name: 'Edit 5 Takes' });
	await sheet.getByRole('button', { name: /^T-stop/ }).tap();
	await sheet.getByRole('textbox', { name: 'T-stop' }).fill('5.6');
	await expect(sheet.getByText('Changes 5 takes.')).toBeVisible();
	await sheet.getByRole('button', { name: 'Set on 5 Takes' }).tap();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('status').filter({ hasText: 'T-stop set on 5 takes' })).toBeVisible();
	await holds(page, 'T-stop', '5.6');

	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect(page.getByRole('status').filter({ hasText: 'Undone' })).toBeVisible();
	await holds(page, 'T-stop', 'Mixed');

	// Again, and a reload keeps it.
	await page.getByRole('toolbar').getByRole('button', { name: 'Edit' }).tap();
	await sheet.getByRole('button', { name: /^T-stop/ }).tap();
	await sheet.getByRole('textbox', { name: 'T-stop' }).fill('5.6');
	await sheet.getByRole('button', { name: 'Set on 5 Takes' }).tap();
	await expect(sheet).toBeHidden();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
	await circle(page, '1', 'A').tap();
	await page.getByRole('button', { name: 'Select All' }).tap();
	await holds(page, 'T-stop', '5.6');
});

test('marks and a clear on many takes, with what already holds it said first', async ({ page }) => {
	await open42A(page);
	await circle(page, '1', 'A').tap();
	await page.getByRole('button', { name: 'Select All' }).tap();
	await page.getByRole('toolbar').getByRole('button', { name: 'Edit' }).tap();
	const sheet = page.getByRole('dialog', { name: 'Edit 5 Takes' });
	await sheet.getByRole('button', { name: /^Circled/ }).tap();
	await expect(sheet.getByText('Changes 3 takes. 2 already hold it.')).toBeVisible();
	await sheet.getByRole('button', { name: 'Set on 3 Takes' }).tap();
	await expect(page.getByRole('table', { name: 'Takes' }).getByText('Circled')).toHaveCount(5);

	await page.getByRole('toolbar').getByRole('button', { name: 'Edit' }).tap();
	await sheet.getByRole('button', { name: /^Circled/ }).tap();
	await sheet.getByRole('radio', { name: 'Clear' }).tap();
	await sheet.getByRole('button', { name: 'Clear on 5 Takes' }).tap();
	await expect(page.getByRole('table', { name: 'Takes' }).getByText('Circled')).toHaveCount(0);
});

test('a drag down the selection column selects every take it passes', async ({ page }) => {
	await open42A(page);
	const first = (await circle(page, '1', 'A').boundingBox())!;
	const last = (await circle(page, '2', 'B').boundingBox())!;
	await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
	await page.mouse.down();
	await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 8 });
	await page.mouse.up();
	await expect(page.getByRole('toolbar', { name: '4 selected' })).toBeVisible();
	await expect(circle(page, '3', 'A')).toHaveAttribute('aria-checked', 'false');
});

test('All Takes selects across slates and filters by camera setup', async ({ page }) => {
	await openApp(page, '/slates');
	await page.getByRole('link', { name: /All Takes/ }).tap();
	await expect(page.getByRole('heading', { name: 'All Takes', level: 1 })).toBeVisible();
	await settled(page);
	await expect(page.getByText('6 of 6 takes')).toBeVisible();
	await page.getByRole('combobox', { name: 'Camera setup' }).selectOption({ label: 'B' });
	await expect(page.getByText('2 of 6 takes')).toBeVisible();
	await page.getByRole('combobox', { name: 'Camera setup' }).selectOption({ label: 'All' });
	await page.getByRole('checkbox').first().tap();
	await page.getByRole('button', { name: 'Select All' }).tap();
	await expect(page.getByRole('toolbar', { name: '6 selected' })).toBeVisible();
});

test('the list filters, and a slate is duplicated and deleted with undo', async ({ page }) => {
	await openApp(page, '/slates');
	await page.getByRole('button', { name: 'Not synced' }).tap();
	await expect(page.getByRole('link', { name: /^42A/ })).toBeVisible();
	await page.getByRole('button', { name: 'Not synced' }).tap();

	await page.getByRole('link', { name: /^42B/ }).tap();
	await page.getByRole('button', { name: 'More' }).tap();
	await page.getByRole('menuitem', { name: 'Duplicate' }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42C', level: 1 })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Driver through the windscreen.');

	await page.getByRole('button', { name: 'Delete Slate' }).tap();
	await expect(page).toHaveURL(/\/slates$/);
	await expect(page.getByRole('link', { name: /^42C/ })).toHaveCount(0);
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect(page.getByRole('link', { name: /^42C/ })).toBeVisible();
});
