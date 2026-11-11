// The PWA: the manifest, the service worker, and the shell offline after one online load.
import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { startPreview, type Preview } from './server';

test.describe('pwa', () => {
	test('the manifest is linked, served and valid', async ({ page, request }) => {
		await open(page, '/');
		const href = await page.locator('link[rel="manifest"]').getAttribute('href');
		expect(href, 'a manifest link').toBeTruthy();
		const res = await request.get(new URL(href!, page.url()).href);
		expect(res.status()).toBe(200);
		const m = await res.json();
		expect(m.name).toBeTruthy();
		expect(m.short_name).toBeTruthy();
		expect(m.start_url).toBe('/');
		expect(m.scope).toBe('/');
		expect(['standalone', 'fullscreen']).toContain(m.display);
		const sizes = (m.icons as { sizes: string }[]).map((i) => i.sizes);
		expect(sizes).toContain('192x192');
		expect(sizes).toContain('512x512');
		for (const icon of m.icons as { src: string; type: string }[]) {
			const r = await request.get(icon.src);
			expect(r.status(), icon.src).toBe(200);
			expect(r.headers()['content-type'], icon.src).toContain(icon.type);
		}
	});

	test('the service worker registers and takes control', async ({ page }) => {
		await open(page, '/');
		await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15_000 });
		const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
		expect(new URL(scope).pathname).toBe('/');
	});

	test.describe('offline', () => {
		// Offline, the browser logs the loads that fail on purpose.
		test.use({ allowConsoleErrors: true });

		let server: Preview;
		test.beforeEach(async () => {
			server = await startPreview();
		});
		test.afterEach(async () => {
			await server.stop();
		});

		/**
		 * Load `path` online until the service worker controls the page, load it once more so the
		 * worker keeps that page too (the first load came before the worker), then stop the server.
		 */
		async function onlineThenOffline(page: Page, path: string) {
			await open(page, server.origin + path);
			await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15_000 });
			await open(page, server.origin + path);
			await server.stop();
		}

		test('after one online load, / opens offline', async ({ page }) => {
			await onlineThenOffline(page, '/');
			await open(page, server.origin + '/');
			// A device with no project: the way in leads to the first run.
			await expect(page.getByRole('button', { name: 'Create Project', exact: true })).toBeVisible();
		});

		test('the take screen loaded online opens offline, on the data stored', async ({ page }) => {
			await open(page, server.origin + '/welcome');
			await page.getByRole('button', { name: 'Load the Sample Project' }).tap();
			await page.waitForURL(/\/shoot$/);
			await onlineThenOffline(page, '/shoot');
			await open(page, server.origin + '/shoot');
			await expect(page.getByRole('toolbar', { name: 'Capture' })).toBeVisible();
		});

		// The cached `/` shell serves every route offline, so its asset URLs must be absolute:
		// `kit.paths.relative` is off in vite.config.ts.
		test('after one online load at /, a route never opened online opens offline', async ({ page }) => {
			await onlineThenOffline(page, '/');
			await open(page, server.origin + '/proto/themes');
			await expect(page.locator('body')).not.toBeEmpty();
		});
	});
});
