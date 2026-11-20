// The names an admin picks (#111), in the sync sheet, against the fake Flow PT site of lib/fpt
// (fakeFpt.ts, corpus shapes), run in this test process: every request to the site is answered by
// it through a route, and anything else off localhost is aborted. The service worker is blocked:
// it would take the requests before the route sees them. No real site is reached.
import type { Page, Route } from '@playwright/test';
import { BEARER, fakeFpt, type FakeFpt } from '../src/lib/fpt/fakeFpt';
import { expect, isLocal, test as suite } from './fixtures';

const SITE = 'https://studio.shotgrid.autodesk.com';

// The site's requests are answered here, so they are no request that left: the check below is ours.
const test = suite.extend<{ site: FakeFpt }>({
	offsite: [async ({}, use) => use([]), { auto: true }],
	site: async ({ page, context }, use) => {
		const fpt = fakeFpt({ fields: 'complete' });
		fpt.seed('Project', { name: 'Show', is_template: false, is_demo: false, archived: false });
		const left: string[] = [];
		await context.route(/^https?:\/\//, (route: Route) => {
			const url = route.request().url();
			if (isLocal(url) || url.startsWith(`${SITE}/`)) return route.fallback();
			left.push(url);
			return route.abort();
		});
		const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };
		await page.route(`${SITE}/**`, async (route) => {
			const req = route.request();
			if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
			// The session's bearer, as the site mints it (corpus findings/052).
			if (req.url().includes('/auth/access_token')) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, json: { access_token: BEARER, token_type: 'Bearer', expires_in: 600 } });
			const res = await fpt.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() ?? undefined });
			await route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') ?? 'application/json' }, body: await res.text() });
		});
		await page.addInitScript((site) => localStorage.setItem('sg-onset:auth', JSON.stringify({ v: 1, site, user: 'ada@studio.example', token: 'token-for-tests' })), SITE);
		await use(fpt);
		expect(left, 'requests that left localhost').toEqual([]);
	}
});
test.use({ serviceWorkers: 'block', ignoreConsole: [/404/] });

/** The sample project, linked to Show; the sync sheet open at Setup. */
async function linked(page: Page) {
	await page.goto('/');
	await page.waitForURL(/\/(welcome|shoot)$/);
	if (page.url().endsWith('/welcome')) {
		await page.getByRole('button', { name: 'Load the Sample Project' }).tap();
		await page.waitForURL(/\/shoot$/);
	}
	await page.getByRole('button', { name: /^Sync:/ }).first().tap();
	await page.getByRole('button', { name: 'Link a Project' }).tap();
	await page.getByRole('button', { name: 'Show', exact: true }).tap();
}

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
