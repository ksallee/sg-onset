// The names an admin picks (#111), in the sync sheet, against the fake Flow PT site (fakeSite.ts).
import { expect, linked, test } from './fakeSite';

test.use({ serviceWorkers: 'block', ignoreConsole: [/404/] });

test('an admin renames a field, reviews it, and the name is kept on the Flow PT project', async ({ page, site }) => {
	// One field missing: the site is not ready, nothing syncs yet, and every name may change.
	delete site.fields.CustomEntity09.sg_tilt;
	await linked(page);
	await expect(page.getByText('Not ready')).toBeVisible();
	await page.getByRole('button', { name: /^Names/ }).tap();
	await expect(page.getByText('Every device of this Flow PT project uses these names', { exact: false })).toBeVisible();
	await page.waitForTimeout(500);
	await page.getByRole('button', { name: /^T-Stop/ }).last().tap();
	await page.waitForTimeout(500);
	await page.getByLabel('Name').last().fill('Studio T-Stop');
	await page.getByLabel('Name').last().press('Enter');
	await page.keyboard.press('Escape');
	await page.waitForTimeout(500);
	await expect(page.getByRole('button', { name: /^T-Stop.*Studio T-Stop/ }).last()).toBeVisible();
	await page.getByRole('button', { name: 'Review Changes' }).tap();
	await expect(page.getByText('Names to save', { exact: false })).toBeVisible();
	await expect(page.getByText('Studio T-Stop').last()).toBeVisible();
	await page.getByRole('button', { name: 'Set Up Fields' }).last().tap();
	await expect(page.getByText('Names saved on the Flow PT project.')).toBeVisible();
	const project = site.live('Project').find((r) => r.values.name === 'Show')!;
	expect(JSON.parse(String(project.values.sg_onset_naming))).toEqual({ app: 'sg-onset', naming: 1, entities: {}, fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' } } });
	expect(site.fields.CustomEntity09.sg_studio_t_stop).toBeDefined();
	expect(site.fields.CustomEntity09.sg_tilt).toBeDefined();
});

test('once the project has synced, what is in use stays as it is', async ({ page, site }) => {
	await linked(page);
	await expect(page.getByText('Ready to sync')).toBeVisible();
	// The sample project syncs to the ready site.
	await expect.poll(() => site.live('CustomEntity09').length, { timeout: 15_000 }).toBeGreaterThan(0);
	await page.getByRole('button', { name: /^Names/ }).tap();
	await expect(page.getByText('This project has synced. The names in use stay as they are.', { exact: false })).toBeVisible();
	await expect(page.getByText('CustomEntity09 · Found · In use')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Review Changes' })).toBeDisabled();
});
