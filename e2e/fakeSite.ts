// The fake Flow PT site of lib/fpt (fakeFpt.ts, corpus shapes), run in the test process, for the
// specs that sync: every request to the site is answered by it through a route, and anything else
// off localhost is aborted. The service worker is blocked: it would take the requests before the
// route sees them. No real site is reached.
import type { Page, Route } from '@playwright/test';
import { BEARER, fakeFpt, type FakeFpt } from '../src/lib/fpt/fakeFpt';
import { expect, isLocal, test as suite } from './fixtures';

export const SITE = 'https://studio.shotgrid.autodesk.com';

// The site's requests are answered here, so they are no request that left: the check below is ours.
export const test = suite.extend<{ site: FakeFpt }>({
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

/** The sample project, linked to Show; the sync sheet open at Setup. */
export async function linked(page: Page) {
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

export { expect };
