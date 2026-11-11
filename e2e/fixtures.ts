// The suite's `test`: every page is watched for console errors, uncaught exceptions and requests
// that leave localhost, checked when the test ends. A test fails on any of them unless it opts out with
// `test.use({ allowConsoleErrors: true })` (offline runs log failed loads on purpose).
import { test as base, expect, type Page } from '@playwright/test';

const LOCAL = /^(?:https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/|data:|blob:|about:)/;

export const isLocal = (url: string) => LOCAL.test(url);

type Fixtures = {
	allowConsoleErrors: boolean;
	/** Console errors to let pass, e.g. the browser's own line for a 4xx a test expects. */
	ignoreConsole: RegExp[];
	/** Console errors and page errors seen so far, as text. */
	consoleErrors: string[];
	/** Requests to anywhere but localhost, seen so far. */
	offsite: string[];
};

export const test = base.extend<Fixtures>({
	allowConsoleErrors: [false, { option: true }],
	ignoreConsole: [[], { option: true }],
	consoleErrors: [async ({ page, allowConsoleErrors, ignoreConsole }, use) => {
		const errors: string[] = [];
		page.on('console', (m) => {
			if (m.type() === 'error' && !ignoreConsole.some((re) => re.test(m.text()))) errors.push(`console: ${m.text()}`);
		});
		page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
		await use(errors);
		if (!allowConsoleErrors) expect(errors, 'console errors').toEqual([]);
	}, { auto: true }],
	offsite: [async ({ context }, use) => {
		const urls: string[] = [];
		context.on('request', (r) => {
			if (!isLocal(r.url())) urls.push(r.url());
		});
		await use(urls);
		expect(urls, 'requests that left localhost').toEqual([]);
	}, { auto: true }]
});

export { expect };

/** Open a page and wait until the app has rendered (SvelteKit renders in the browser). */
export async function open(page: Page, path: string) {
	await page.goto(path);
	await page.waitForFunction(() => document.body.innerText.trim().length > 0);
}

/**
 * Open a page of the app proper (anything in the shell). Those need a project, so this first
 * loads the sample project through the first run, on a device that has none, then goes to `path`.
 */
export async function openApp(page: Page, path: string) {
	await page.goto('/');
	await page.waitForURL(/\/(welcome|shoot)$/);
	if (page.url().endsWith('/welcome')) {
		await page.getByRole('button', { name: 'Load the Sample Project' }).tap();
		await page.waitForURL(/\/shoot$/);
	}
	if (path !== '/shoot') await page.goto(path);
	await page.getByRole('navigation', { name: 'Sections' }).waitFor();
	await page.waitForFunction(() => document.querySelector('.ios-page, .ios-workspace') !== null);
}
