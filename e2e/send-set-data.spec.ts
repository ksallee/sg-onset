// "Send set data to artists" (#106): Flow PT's Action Menu Item posts a form to this app's route,
// which sends the browser on to the page. No Flow PT site is reached: the posts come from this test
// (in the shape probe 156 recorded, corpus findings/156_action_menu_item.md), sign-in's two
// endpoints are mocked, and every request off localhost is aborted as well as recorded.
//
// What the page does once signed in to the right site (read Flow PT, Send, the report) calls the
// site from the browser, which this suite forbids: lib/fpt/sendSetData.test.ts and lib/send/*.test.ts
// run it against the fake site instead.
import type { Page, Route } from '@playwright/test';
import { auditLayout } from './audit';
import { expect, isLocal, open, test } from './fixtures';

const HOST = 'studio.shotgrid.autodesk.com';
const APPROVAL = `https://${HOST}/app_session_launcher/abc123`;

/** The form as probe 156 recorded it from Chrome, personal fields included so the test sees them dropped. */
const FORM: Record<string, string> = {
	user_id: '253',
	user_login: 'ada@studio.example',
	title: 'undefined',
	entity_type: 'Shot',
	server_hostname: HOST,
	referrer_path: '/detail/HumanUser/253',
	page_id: '35602',
	session_uuid: '0f8fad5b-d9cb-469f-a165-70867728950e',
	project_name: 'Show',
	project_id: '1180',
	ids: '7609,7642,7851,7852,7853',
	selected_ids: '7851,7852',
	cols: 'image,code,sg_sequence',
	sort_column: 'code',
	sort_direction: 'asc'
};

/**
 * Posts the form from a page with no origin, as Flow PT's tab does (`Origin: null`), and lands where
 * the route sends the browser.
 */
async function postFromFlow(page: Page, baseURL: string | undefined, fields: Record<string, string> = FORM) {
	const action = new URL('/action/send-set-data', baseURL).href;
	await page.goto('about:blank');
	await page.setContent(
		`<form method="post" action="${action}" enctype="application/x-www-form-urlencoded">${Object.entries(fields)
			.map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}">`)
			.join('')}</form>`
	);
	await Promise.all([page.waitForURL(/\/send-set-data/), page.locator('form').evaluate((f: HTMLFormElement) => f.submit())]);
	await page.waitForFunction(() => document.body.innerText.trim().length > 0);
}

const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('send set data: the route', () => {
	test('a form from Flow PT is taken from another origin, and sent on with four values and nothing personal', async ({ request }) => {
		const res = await request.post('/action/send-set-data', { form: FORM, headers: { origin: 'null', 'sec-fetch-site': 'cross-site' }, maxRedirects: 0 });
		expect(res.status()).toBe(303);
		expect(res.headers()['location']).toBe(`/send-set-data?site=${HOST}&project=1180&type=Shot&ids=7851%2C7852`);
		expect(res.headers()['cache-control']).toBe('no-store');
	});

	test('a site off the list is sent to the page that says so', async ({ request }) => {
		const res = await request.post('/action/send-set-data', { form: { ...FORM, server_hostname: 'evil.example' }, headers: { origin: 'null' }, maxRedirects: 0 });
		expect(res.headers()['location']).toBe('/send-set-data?problem=not-allowed');
	});

	test('the sign-in routes still refuse a form from another site', async ({ request }) => {
		const res = await request.post('/auth/session-request', { form: { site: HOST }, headers: { origin: 'https://evil.example' }, maxRedirects: 0 });
		expect(res.status()).toBe(403);
		expect(await res.text()).toBe('Cross-site POST form submissions are forbidden');
	});
});

test.describe('send set data: the page', () => {
	// The service worker would answer the app's own requests before a mocked route sees them.
	test.use({ serviceWorkers: 'block' });
	test.use({ ignoreConsole: [/status of \d+|Failed to load resource|net::ERR_|Load failed|access control checks/] });

	test.beforeEach(async ({ context }) => {
		await context.route((url) => !isLocal(url.href), (route) => route.abort('blockedbyclient'));
	});

	test('posted from Flow PT: asks to sign in to that site first, writes nothing, and every control is named and at least 44 px', async ({ page, baseURL, offsite }) => {
		await postFromFlow(page, baseURL);
		expect(page.url()).toMatch(new RegExp(`/send-set-data\\?site=${HOST.replace(/\./g, '\\.')}&project=1180&type=Shot&ids=7851%2C7852$`));
		expect(page.url()).not.toMatch(/ada|253|0f8fad5b/);
		await expect(page.getByRole('heading', { name: 'Send Set Data' })).toBeVisible();
		await expect(page.getByText(`Sign in to ${HOST} to go on.`)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Send' })).toHaveCount(0);
		const audit = await auditLayout(page, test.info(), '/send-set-data (sign in)');
		expect(audit.small).toEqual([]);
		expect(audit.unnamed).toEqual([]);
		expect(offsite).toEqual([]);
	});

	test('signed in to another site: says so, and that signing in replaces it; nothing is read', async ({ page, offsite }) => {
		await page.addInitScript(() => localStorage.setItem('sg-onset:auth', JSON.stringify({ v: 1, site: 'https://other.shotgrid.autodesk.com', user: 'ada@studio.example', token: 'token-for-tests' })));
		await open(page, `/send-set-data?site=${HOST}&project=1180&type=Shot&ids=7851`);
		await expect(page.getByText(`You are signed in to other.shotgrid.autodesk.com. Sign in to ${HOST} to go on. It replaces that session on this device.`)).toBeVisible();
		expect(offsite).toEqual([]);
	});

	test('Sign In asks for that site’s approval page, opens it, and waits', async ({ page }) => {
		await page.addInitScript(() => {
			const w = window as unknown as { open: unknown; __tab: { url?: string } };
			w.__tab = {};
			w.open = () => ({ document: { title: '', body: { textContent: '' } }, location: { replace: (url: string) => (w.__tab.url = url) }, close: () => {}, opener: {} });
		});
		const asked: string[] = [];
		await page.route('**/auth/session-request', async (route) => {
			asked.push((route.request().postDataJSON() as { site: string }).site);
			await json(route, 200, { id: 'abc123', url: APPROVAL });
		});
		await page.route('**/auth/session-poll', (route) => json(route, 200, { approved: false }));
		await open(page, `/send-set-data?site=${HOST}&project=1180&type=Shot&ids=7851`);
		await page.getByRole('button', { name: 'Sign In' }).tap();
		await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();
		expect(asked).toEqual([`https://${HOST}`]);
		expect(await page.evaluate(() => (window as unknown as { __tab: { url?: string } }).__tab.url)).toBe(APPROVAL);
		await page.getByRole('button', { name: 'Cancel' }).tap();
		await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
	});

	test('a site off the list, nothing selected, or a page opened by hand: each says so in words', async ({ page, baseURL }) => {
		await postFromFlow(page, baseURL, { ...FORM, server_hostname: 'evil.example' });
		await expect(page.getByRole('alert')).toHaveText('This copy of SG OnSet does not work with that Flow PT site. Whoever runs it chooses the sites.');
		await postFromFlow(page, baseURL, { ...FORM, selected_ids: '' });
		await expect(page.getByRole('alert')).toHaveText('No rows were selected. Select Shots or Set Shots in Flow PT, then run it again.');
		await open(page, '/send-set-data');
		await expect(page.getByRole('alert')).toHaveText('Open this page from Flow PT. Select Shots or Set Shots, then pick Send set data to artists in the menu.');
		await open(page, '/send-set-data?site=10.0.0.1&project=1&type=Shot&ids=1');
		await expect(page.getByRole('alert')).toHaveText('SG OnSet could not read what Flow PT sent. Run it again from Flow PT.');
	});

	// The summary, Send and the report call the Flow PT site from the browser once signed in to it:
	// this suite fails any request off localhost. Covered by lib/fpt/sendSetData.test.ts against the
	// fake site, and by lib/send/*.test.ts for the words.
	test.skip('signed in to that site: the summary, Send, and the report per Shot', () => {});
});
