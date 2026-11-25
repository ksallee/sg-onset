// The rig (#138) on the sample project: set on camera setup A in Gear, as the lens is, carried by
// the next take on A, read back on that take and in the day report, while the take shot before
// keeps none. A rig the project adds in Settings is one to pick. Role and label selectors only.
// Every test starts on an empty device.
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

const rail = (page: Page) => page.getByRole('toolbar', { name: 'Capture' });
const settled = (page: Page) => page.waitForFunction(() => !document.documentElement.dataset.nav);

/** Camera setup A in Gear: on a phone it opens on its own page. */
async function openSetupA(page: Page) {
	await openApp(page, '/gear');
	await page.getByRole('button', { name: /^A\s/ }).first().tap();
	await expect(page.getByRole('heading', { name: 'A', level: 2, exact: true })).toBeVisible();
	await settled(page);
}

const rigRow = (page: Page) => page.getByRole('button', { name: /^Rig\b/ });

/** Picks a rig for setup A in its picker. */
async function pickRig(page: Page, rig: string) {
	await rigRow(page).tap();
	const picker = page.getByRole('dialog', { name: 'Rig for A' });
	await picker.getByRole('button', { name: rig, exact: true }).tap();
	await expect(picker).toBeHidden();
}

/** The Rig of a take of slate 42A, from its sheet on the slate's page. */
async function rigOfTake(page: Page, take: string) {
	await page.getByRole('button', { name: `Open take ${take}` }).tap();
	const sheet = page.getByRole('dialog', { name: `Take ${take.replace(' ', ' · ')}` });
	const value = await sheet.getByRole('combobox', { name: 'Rig' }).inputValue();
	await sheet.getByRole('button', { name: 'Done' }).tap();
	await expect(sheet).toBeHidden();
	return value;
}

test('a rig set on camera setup A goes to the next take on A, and shows on the take and in the day report', async ({ page }) => {
	await openSetupA(page);
	await expect(rigRow(page)).toContainText('None');
	await expect(page.getByText('Takes already shot keep the camera, lens and rig they were shot with.').first()).toBeVisible();
	await pickRig(page, 'Steadicam');
	await expect(rigRow(page)).toContainText('Steadicam');
	await expect(page.getByRole('status').filter({ hasText: 'A: Steadicam' })).toBeVisible();

	// The next take on 42A gets the rig from the setup.
	await openApp(page, '/shoot');
	const pick = page.getByRole('button', { name: /^Slate 42A(?!,)\b/ });
	const change = page.getByRole('button', { name: /^Change Slate/ });
	await expect(pick.or(change).first()).toBeVisible();
	if ((await change.count()) && !(await change.getAttribute('aria-label'))?.endsWith(' 42A')) await change.tap();
	if (await pick.count()) await pick.tap();
	const startEnd = rail(page).getByRole('button', { name: /^(Start|End)\b/ });
	await expect(startEnd).toHaveAccessibleName(/^Start Take 4$/);
	await startEnd.tap();
	await expect(rail(page).getByRole('button', { name: /^End\b/ })).toBeVisible();

	// On the take: take 4 on A holds it; take 3, shot before, keeps none.
	await openApp(page, '/slates');
	await page.getByRole('link', { name: /^42A/ }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
	await settled(page);
	expect(await rigOfTake(page, '4 A')).toBe('steadicam');
	expect(await rigOfTake(page, '3 A')).toBe('');

	// In the day report: a Rig column, Steadicam on take 4.
	await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Wrap' }).tap();
	await expect(page.getByRole('heading', { name: 'Wrap', level: 1 })).toBeVisible();
	await page.getByRole('link', { name: /^Day Report/ }).tap();
	await expect(page).toHaveURL(/\/wrap\/report\?days=/);
	const slate = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Slate 42A' }) }).first();
	await expect(slate.getByRole('columnheader', { name: 'Rig' })).toBeVisible();
	await expect(slate.getByRole('cell', { name: 'Steadicam', exact: true })).toHaveCount(1);
});

test('a rig the project adds in Settings is one to pick on a camera setup', async ({ page }) => {
	await openApp(page, '/settings');
	await page.getByRole('button', { name: /^Rigs/ }).tap();
	const rigs = page.getByRole('dialog', { name: 'Rigs' });
	await expect(rigs.getByText('Underwater housing', { exact: true })).toBeVisible();
	await rigs.getByRole('textbox', { name: 'New rig' }).fill('Russian arm');
	await rigs.getByRole('button', { name: 'Add' }).tap();
	await expect(rigs.getByText('Russian arm', { exact: true })).toBeVisible();
	await rigs.getByRole('textbox', { name: 'New rig' }).fill('hi-hat');
	await rigs.getByRole('button', { name: 'Add' }).tap();
	await expect(rigs.getByText('That rig is already there.')).toBeVisible();
	await rigs.getByRole('button', { name: 'Done' }).tap();

	await openSetupA(page);
	await pickRig(page, 'Russian arm');
	await expect(rigRow(page)).toContainText('Russian arm');
	await page.reload();
	await expect(rigRow(page)).toContainText('Russian arm');
});
