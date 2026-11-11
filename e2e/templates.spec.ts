// Live templates on real stored data: three slates made from a template, a field changed by hand
// on one, the template edited with "only fields still holding the old template value" (the hand
// change stays), undone as one, then edited with "all fields"; and everything after a reload.
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

const description = (page: Page) => page.getByRole('textbox', { name: 'Description' });

async function slateDescription(page: Page, id: string) {
	await page.goto(`/slates/${id}`);
	await expect(page.getByRole('heading', { level: 1, name: /^Slate / }).last()).toBeVisible();
	await expect(description(page)).not.toHaveValue('');
	return description(page).inputValue();
}

async function newSlateFrom(page: Page, template: string, name: string): Promise<string> {
	await page.goto('/slates');
	await page.getByRole('button', { name: 'New Slate' }).first().tap();
	const sheet = page.getByRole('dialog', { name: 'New Slate' });
	await sheet.getByRole('combobox', { name: 'Template' }).selectOption({ label: template });
	await expect(sheet.getByRole('textbox', { name: 'Slate' })).toHaveValue(name);
	await sheet.getByRole('button', { name: 'Create' }).tap();
	await expect(page).toHaveURL(/\/slates\/[0-9a-f-]+$/);
	await expect(page.getByRole('heading', { name: `Slate ${name}`, level: 1, exact: true })).toBeVisible();
	await page.waitForFunction(() => !document.documentElement.dataset.nav);
	return page.url().split('/').pop()!;
}

test('a template edit reaches its slates as picked, in one undo, and survives a reload', async ({ page }) => {
	await openApp(page, '/templates');
	await page.getByRole('button', { name: 'New Template' }).tap();
	await page.getByRole('menuitem', { name: 'New Slate Template' }).tap();
	await expect(page).toHaveURL(/\/templates\/[0-9a-f-]+$/);
	await expect(page.getByRole('heading', { name: 'Slate template', level: 1 })).toBeVisible();
	await page.waitForFunction(() => !document.documentElement.dataset.nav);
	const templateUrl = page.url();

	await page.getByRole('textbox', { name: 'Name' }).fill('Rain plate');
	await page.getByRole('textbox', { name: 'Scene' }).fill('50');
	await page.getByRole('textbox', { name: 'Scene' }).blur();
	await description(page).fill('Plate');
	await description(page).blur();
	await page.getByRole('button', { name: 'Save' }).first().tap();
	await expect(page.getByRole('heading', { name: 'Rain plate', level: 1 })).toBeVisible();

	// Three slates from it; the name follows the template's scene.
	const ids = [await newSlateFrom(page, 'Rain plate', '50'), await newSlateFrom(page, 'Rain plate', '50A'), await newSlateFrom(page, 'Rain plate', '50B')];
	await expect(description(page)).toHaveValue('Plate');
	await expect(page.getByRole('link', { name: /Rain plate/ })).toBeVisible();

	// One changed by hand: it says so.
	await page.goto(`/slates/${ids[1]}`);
	await description(page).fill('Hand typed');
	await description(page).blur();
	await expect(page.getByText('Changed here: Description.', { exact: false })).toBeVisible();

	// Edit the template: only the fields still holding the old value.
	await page.goto(templateUrl);
	await description(page).fill('Plate, wet');
	await description(page).blur();
	await page.getByRole('button', { name: 'Save' }).first().tap();
	const review = page.getByRole('dialog', { name: 'Save Template' });
	await expect(review.getByText('3 linked slates would change.')).toBeVisible();
	await expect(review.getByRole('radio', { name: /Only fields that hold the old template value/ })).toHaveAttribute('aria-checked', 'true');
	await expect(review.getByText('Changes 2 fields on 2 slates. Keeps 1 field changed by hand.')).toBeVisible();
	await review.getByRole('button', { name: 'Save and Update' }).tap();
	await expect(review).toBeHidden();

	// Undo takes back the template and the slates together.
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect(description(page)).toHaveValue('Plate');
	expect(await slateDescription(page, ids[0])).toBe('Plate');

	await page.goto(templateUrl);
	await page.reload();
	expect(await slateDescription(page, ids[1])).toBe('Hand typed');
	expect(await slateDescription(page, ids[2])).toBe('Plate');

	// Again, with all fields: the hand change goes too.
	await page.goto(templateUrl);
	await description(page).fill('Plate, wet');
	await description(page).blur();
	await page.getByRole('button', { name: 'Save' }).first().tap();
	await page.getByRole('radio', { name: /^All fields/ }).tap();
	await page.getByRole('button', { name: 'Save and Update' }).tap();
	await expect(page.getByRole('dialog', { name: 'Save Template' })).toBeHidden();

	await page.reload();
	for (const id of ids) expect(await slateDescription(page, id)).toBe('Plate, wet');
	await expect(page.getByText('Every field holds the template value.')).toBeVisible();
});

test('a slate goes back to its template, or leaves it', async ({ page }) => {
	await openApp(page, '/templates');
	await page.getByRole('button', { name: 'New Template' }).tap();
	await page.getByRole('menuitem', { name: 'New Slate Template' }).tap();
	await expect(page.getByRole('heading', { name: 'Slate template', level: 1 })).toBeVisible();
	await page.waitForFunction(() => !document.documentElement.dataset.nav);
	await page.getByRole('textbox', { name: 'Scene' }).fill('7');
	await page.getByRole('textbox', { name: 'Scene' }).blur();
	await page.getByRole('button', { name: 'Save' }).first().tap();
	await expect(page.getByRole('toolbar', { name: 'Not saved' })).toHaveCount(0);
	const id = await newSlateFrom(page, 'Slate template', '7');

	await page.getByRole('textbox', { name: 'Scene' }).fill('8');
	await page.getByRole('textbox', { name: 'Scene' }).blur();
	await page.getByRole('button', { name: 'Reset 1 Field to Template' }).tap();
	await expect(page.getByRole('textbox', { name: 'Scene' })).toHaveValue('7');

	await page.getByRole('button', { name: 'Unlink' }).tap();
	await expect(page.getByRole('combobox', { name: 'Link to Template' })).toBeVisible();
	await page.reload();
	await expect(page).toHaveURL(new RegExp(id));
	await expect(page.getByRole('combobox', { name: 'Link to Template' })).toBeVisible();
});
