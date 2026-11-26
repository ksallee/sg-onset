// The Rig in Flow PT (#138), against the fake site (fakeSite.ts): on a site without the Rig of Take
// and Camera Setup the rest syncs, and the sync sheet says rigs wait once a camera setup holds one.
// Set Up Fields makes the field, and the rig goes. Role and label selectors only.
import type { Page } from '@playwright/test';
import { expect, linked, test } from './fakeSite';

test.use({ serviceWorkers: 'block', ignoreConsole: [/404/] });

const waiting = (page: Page) => page.getByText('Rigs wait until an admin runs Set Up Fields.', { exact: true });
const openSheet = (page: Page) => page.getByRole('button', { name: /^Sync:/ }).first().tap();

test('rigs wait on a site without the Rig, the sheet says so, and Set Up Fields sends them', async ({ page, site }) => {
	delete site.fields.CustomEntity09.sg_rig;
	delete site.fields.CustomEntity10.sg_rig;
	await linked(page);
	await expect(page.getByText('Ready to sync')).toBeVisible();
	// The sample holds no rig: nothing waits.
	await expect(waiting(page)).toBeHidden();
	await expect.poll(() => site.live('CustomEntity10').length, { timeout: 15_000 }).toBeGreaterThan(0);

	// Setup A gets a rig: the sheet says rigs wait. In the app, so no sync under way is cut off.
	await page.getByRole('dialog', { name: 'Sync' }).getByRole('button', { name: 'Done' }).tap();
	await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Gear' }).tap();
	await page.getByRole('button', { name: /^A\s/ }).first().tap();
	await page.getByRole('button', { name: /^Rig\b/ }).tap();
	await page.getByRole('dialog', { name: 'Rig for A' }).getByRole('button', { name: 'Steadicam', exact: true }).tap();
	await expect(page.getByRole('button', { name: /^Rig\b/ })).toContainText('Steadicam');
	await openSheet(page);
	await expect(waiting(page)).toBeVisible();

	// An admin runs Set Up Fields: the Rig is made, the line goes, the rig is in Flow PT.
	await page.getByRole('button', { name: 'Set Up Fields' }).first().tap();
	await page.getByRole('button', { name: 'Set Up Fields' }).last().tap();
	await expect(waiting(page)).toBeHidden();
	expect(site.fields.CustomEntity10.sg_rig).toBeDefined();
	await expect.poll(() => site.live('CustomEntity10').some((r) => r.values.sg_rig === 'Steadicam'), { timeout: 15_000 }).toBe(true);
});
