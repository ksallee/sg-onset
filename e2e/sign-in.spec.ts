// Sign-in, without a Flow PT site. Bad sites are refused here or by this app's own server; the
// rest of the flow runs against mocked answers of the app's two endpoints. Nothing leaves
// localhost: every request off it is aborted as well as recorded, and the approval tab is never
// really opened (window.open is replaced), so a slip can never reach a real site.
import type { Page, Route } from '@playwright/test';
import { auditLayout } from './audit';
import { expect, isLocal, openApp, test } from './fixtures';

const HOST = 'studio.shotgrid.autodesk.com';
const APPROVAL = `https://${HOST}/app_session_launcher/abc123`;
const field = (page: Page) => page.getByRole('textbox', { name: 'Flow PT site' });
const go = (page: Page) => page.getByRole('button', { name: 'Continue' });
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** The approval tab: `blocked` as a popup blocker answers, else a stand-in that notes where it was sent. */
async function tab(page: Page, mode: 'blocked' | 'opens') {
	await page.addInitScript((blocked) => {
		const w = window as unknown as { open: unknown; __tab: { url?: string; closed?: boolean } };
		w.__tab = {};
		w.open = () =>
			blocked
				? null
				: {
						document: { title: '', body: { textContent: '' } },
						location: { replace: (url: string) => (w.__tab.url = url) },
						close: () => (w.__tab.closed = true),
						opener: {}
					};
	}, mode === 'blocked');
}
const tabState = (page: Page) => page.evaluate(() => (window as unknown as { __tab: { url?: string; closed?: boolean } }).__tab);

/** Mocks the request for an approval page. Returns the sites asked for. */
async function mockRequest(page: Page, answer: (route: Route) => unknown = (route) => json(route, 200, { id: 'abc123', url: APPROVAL })) {
	const asked: string[] = [];
	await page.route('**/auth/session-request', async (route) => {
		asked.push((route.request().postDataJSON() as { site: string }).site);
		await answer(route);
	});
	return asked;
}
/** Mocks the poll: each call takes the next answer, the last one repeats. */
async function mockPoll(page: Page, answers: ((route: Route) => unknown)[]) {
	let n = 0;
	await page.route('**/auth/session-poll', async (route) => {
		await answers[Math.min(n++, answers.length - 1)](route);
	});
}
const waitingAnswer = (route: Route) => json(route, 200, { approved: false });
const approvedAnswer = (route: Route) => json(route, 200, { approved: true, sessionToken: 'token-for-tests', userLogin: 'ada@studio.example' });

test.describe('sign-in', () => {
	// The browser logs the 4xx and 5xx answers and the dropped connections these tests make.
	// The service worker would answer the app's own requests before a mocked route sees them.
	test.use({ serviceWorkers: 'block' });
	test.use({ ignoreConsole: [/status of \d+|Failed to load resource|net::ERR_|Load failed|access control checks/] });

	test.beforeEach(async ({ context }) => {
		await context.route((url) => !isLocal(url.href), (route) => route.abort('blockedbyclient'));
	});

	test('loads, says what will happen, and every control is named and at least 44 px', async ({ page }) => {
		await openApp(page, '/sign-in');
		await expect(field(page)).toBeVisible();
		await expect(go(page)).toBeVisible();
		await expect(page.getByText('You’ll approve SG OnSet on your Flow PT site in a new tab.').first()).toBeVisible();
		await expect(page.getByText('You sign in on Flow PT itself. SG OnSet never sees your password.')).toBeVisible();
		await expect(page.getByText(/^Syncing is optional\. If you try it, use a test project on a test site/)).toBeVisible();
		const audit = await auditLayout(page, test.info(), '/sign-in');
		expect(audit.small).toEqual([]);
		expect(audit.unnamed).toEqual([]);
	});

	test('sits in the shell, under Settings, with a way back', async ({ page }) => {
		await openApp(page, '/sign-in');
		await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
		await page.getByRole('link', { name: 'Settings' }).first().tap();
		await expect(page).toHaveURL(/\/settings$/);
	});

	for (const site of ['192.168.1.10', 'studio.shotgrid.autodesk.com:8080', 'me@studio.shotgrid.autodesk.com', 'ftp://studio.shotgrid.autodesk.com']) {
		test(`refuses ${site} with its reason, and asks nobody`, async ({ page, offsite }) => {
			await tab(page, 'opens');
			const asked = await mockRequest(page);
			await openApp(page, '/sign-in');
			await field(page).fill(site);
			await go(page).tap();
			const alert = page.getByRole('alert');
			await expect(alert).toHaveText(/IP address|Leave out the port|no name or password|https address/);
			await expect(field(page)).toHaveValue(site);
			expect(asked).toEqual([]);
			expect((await tabState(page)).url).toBeUndefined();
			expect(offsite).toEqual([]);
		});
	}

	for (const site of ['http://evil.example', 'https://evil.example']) {
		test(`this app's server refuses ${site}, and asks nobody but localhost`, async ({ page, offsite }) => {
			await tab(page, 'opens');
			await openApp(page, '/sign-in');
			await field(page).fill(site);
			await go(page).tap();
			await expect(page.getByRole('alert')).toHaveText(/Autodesk-hosted Flow PT sites only/);
			expect(await tabState(page)).toEqual({ closed: true });
			expect(offsite).toEqual([]);
		});
	}

	test('an empty field is asked for, calmly', async ({ page }) => {
		await openApp(page, '/sign-in');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await go(page).tap();
		await expect(page.getByRole('alert')).toHaveText('Type your Flow PT site.');
		await field(page).fill('s');
		await expect(page.getByRole('alert')).toHaveCount(0);
	});

	for (const typed of ['studio.shotgrid.autodesk.com', 'https://studio.shotgrid.autodesk.com', 'https://studio.shotgrid.autodesk.com/', '  HTTPS://Studio.ShotGrid.Autodesk.com/page/1234?x=1#y  ', 'studio .shotgrid.autodesk.com', 'studio']) {
		test(`takes "${typed}" as the site`, async ({ page }) => {
			await tab(page, 'opens');
			const asked = await mockRequest(page);
			await mockPoll(page, [waitingAnswer]);
			await openApp(page, '/sign-in');
			await field(page).fill(typed);
			if (typed.trim().toLowerCase() !== HOST) await expect(page.getByText(`Signs in to ${HOST}`)).toBeVisible();
			await go(page).tap();
			await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();
			expect(asked).toEqual([`https://${HOST}`]);
		});
	}

	test('opens the approval tab from the tap, waits, and can open it again or cancel', async ({ page }) => {
		await tab(page, 'opens');
		const asked = await mockRequest(page);
		await mockPoll(page, [waitingAnswer]);
		await openApp(page, '/sign-in');
		await field(page).fill(HOST);
		await go(page).dblclick();

		await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();
		await expect(page.getByText(HOST, { exact: true })).toBeVisible();
		expect((await tabState(page)).url).toBe(APPROVAL);
		// Two taps asked once.
		expect(asked).toHaveLength(1);

		const again = page.getByRole('link', { name: 'Open the Approval Page Again' });
		await expect(again).toHaveAttribute('href', APPROVAL);
		await expect(again).toHaveAttribute('target', '_blank');
		const audit = await auditLayout(page, test.info(), '/sign-in (waiting)');
		expect(audit.small).toEqual([]);
		expect(audit.unnamed).toEqual([]);

		await page.getByRole('button', { name: 'Cancel' }).tap();
		await expect(field(page)).toHaveValue(HOST);
		await expect(page.getByRole('alert')).toHaveCount(0);
	});

	test('a blocked tab becomes a link to tap', async ({ page }) => {
		await tab(page, 'blocked');
		await mockRequest(page);
		await mockPoll(page, [waitingAnswer]);
		await openApp(page, '/sign-in');
		await field(page).fill(HOST);
		await go(page).tap();
		await expect(page.getByText(/The browser blocked the new tab\./)).toBeVisible();
		const link = page.getByRole('link', { name: 'Open Flow PT' });
		await expect(link).toHaveAttribute('href', APPROVAL);
		await expect(link).toHaveAttribute('target', '_blank');
	});

	test('from the Home Screen no tab is opened ahead: the link is offered', async ({ page }) => {
		await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
		await tab(page, 'opens');
		await mockRequest(page);
		await mockPoll(page, [waitingAnswer]);
		await openApp(page, '/sign-in');
		await field(page).fill(HOST);
		await go(page).tap();
		await expect(page.getByRole('link', { name: 'Open Flow PT' })).toHaveAttribute('href', APPROVAL);
		expect(await tabState(page)).toEqual({});
	});

	test('approved: says who, returns to where the person was, and Sign Out forgets this device only', async ({ page }) => {
		await tab(page, 'opens');
		await mockRequest(page);
		await mockPoll(page, [waitingAnswer, approvedAnswer]);
		await openApp(page, '/slates');
		// From the sync detail, as a person would.
		await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: /^Sync:/ }).tap();
		await page.getByRole('dialog', { name: 'Sync' }).getByRole('link', { name: /Sign In/ }).tap();
		await expect(page).toHaveURL(/\/sign-in$/);
		await field(page).fill(HOST);
		await go(page).tap();

		await expect(page.getByRole('heading', { name: 'Signed in' })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('ada@studio.example')).toBeVisible();
		await expect(page).toHaveURL(/\/slates$/);

		// Signed in: who and which site, in Settings and on the page.
		await page.goto('/settings');
		await page.getByRole('link', { name: /ada@studio\.example/ }).tap();
		// The picture of Settings left by the push is gone: its row names the account too.
		await expect(page).toHaveURL(/\/sign-in\?next=/);
		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
		await expect(page.locator('[data-page-ghost]')).toHaveCount(0);
		await expect(page.getByText('ada@studio.example')).toBeVisible();
		await expect(page.getByText(HOST, { exact: true })).toBeVisible();
		await expect(page.getByText('Sign Out forgets the session on this device only. Nothing kept here is deleted, and your Flow PT account is untouched.')).toBeVisible();
		const audit = await auditLayout(page, test.info(), '/sign-in (signed in)');
		expect(audit.small).toEqual([]);

		await page.getByRole('button', { name: 'Sign Out' }).dblclick();
		// The site is remembered for the next time.
		await expect(field(page)).toHaveValue(HOST);
		await page.goto('/slates');
		await expect(page.getByRole('link', { name: /42A/ })).toBeVisible();
	});

	test('the next of the link wins over where the person came from', async ({ page }) => {
		await tab(page, 'opens');
		await mockRequest(page);
		await mockPoll(page, [approvedAnswer]);
		await openApp(page, '/sign-in?next=%2Fgear');
		await field(page).fill(HOST);
		await go(page).tap();
		await expect(page).toHaveURL(/\/gear$/, { timeout: 10_000 });
	});

	test('expired: the request ran out on the site', async ({ page }) => {
		await tab(page, 'opens');
		await mockRequest(page);
		await mockPoll(page, [(route) => json(route, 404, { error: 'gone' })]);
		await openApp(page, '/sign-in');
		await field(page).fill(HOST);
		await go(page).tap();
		await expect(page.getByRole('alert')).toHaveText('The request expired or was refused on your site. Start again.', { timeout: 10_000 });
		await expect(field(page)).toHaveValue(HOST);
		await expect(go(page)).toBeEnabled();
	});

	test('refused, unreachable and not allowed each say so, and close the tab', async ({ page }) => {
		await tab(page, 'opens');
		const answers: [number, string, RegExp][] = [
			[502, 'unreachable', /^Your site did not answer\. Check the address and the network\.$/],
			[403, 'not-allowed', /Autodesk-hosted Flow PT sites only/],
			[500, 'boom', /^Your site refused the request\. Check the address\.$/]
		];
		let at = 0;
		await mockRequest(page, (route) => json(route, answers[at][0], { error: answers[at][1] }));
		await openApp(page, '/sign-in');
		await field(page).fill(HOST);
		for (at = 0; at < answers.length; at++) {
			await go(page).tap();
			await expect(page.getByRole('alert')).toHaveText(answers[at][2]);
			expect((await tabState(page)).closed).toBe(true);
			// Typing again clears the reason.
			await field(page).fill(HOST);
			await expect(page.getByRole('alert')).toHaveCount(0);
		}
	});

	test('an approval page that is not on the site is refused', async ({ page, offsite }) => {
		await tab(page, 'opens');
		await mockRequest(page, (route) => json(route, 200, { id: 'abc123', url: 'https://evil.example/approve' }));
		await openApp(page, '/sign-in');
		await field(page).fill(HOST);
		await go(page).tap();
		await expect(page.getByRole('alert')).toHaveText('Your site refused the request. Check the address.');
		expect(await tabState(page)).toEqual({ closed: true });
		expect(offsite).toEqual([]);
	});

	test('offline: says so at once, keeps the site, and remembers it after a reload', async ({ page }) => {
		await tab(page, 'opens');
		await mockRequest(page, (route) => route.abort('internetdisconnected'));
		await openApp(page, '/sign-in');
		await field(page).fill(`https://${HOST}/page/1`);
		await go(page).tap();
		await expect(page.getByRole('alert')).toHaveText('No network. Signing in needs one. Capture works without.');
		await expect(field(page)).toHaveValue(HOST);
		await page.reload();
		await expect(field(page)).toHaveValue(HOST);
	});

	test('going offline while waiting keeps the request, and it is approved once the network is back', async ({ page }) => {
		await tab(page, 'opens');
		await mockRequest(page);
		await mockPoll(page, [waitingAnswer, (route) => route.abort('internetdisconnected'), approvedAnswer]);
		await openApp(page, '/sign-in');
		await field(page).fill(HOST);
		await go(page).tap();
		await expect(page.getByText('No network. The request is kept and tried again when the network is back.')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Signed in' })).toBeVisible({ timeout: 15_000 });
		await expect(page).toHaveURL(/\/settings$/);
	});
});
