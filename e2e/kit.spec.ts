// The kit's frame and layers, on the take screen (Shoot, sample project): the Workspace never scrolls,
// Escape closes only the top layer, and the frame measures itself with no ResizeObserver loop while
// its styles still load.
import type { Route } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

test.describe('styles still loading', () => {
	// The service worker would serve the styles before a held route sees them.
	test.use({ serviceWorkers: 'block' });

	// After an in-app navigation SvelteKit can draw the new page before its styles have loaded.
	// While a style sheet loads, WebKit leaves a new element out of the frame's layout until a
	// script reads a size, then lays everything out again with it. An observer that reads a size
	// in its own callback so changes what it observes, and WebKit throws "ResizeObserver loop
	// completed with undelivered notifications" (#99: once in a few hundred first runs).
	test('the shell takes a change of size with no ResizeObserver loop while its styles still load', async ({ page, consoleErrors }) => {
		let holding = false;
		const held: Route[] = [];
		await page.route('**/*.css', (route) => (holding ? held.push(route) : route.continue()));
		await page.goto('/');
		await page.waitForURL(/\/welcome$/);
		holding = true;
		await page.getByRole('button', { name: 'Load the Sample Project' }).tap();
		await page.getByRole('navigation', { name: 'Sections' }).waitFor();
		await expect.poll(() => held.length).toBeGreaterThan(0);
		// What the race does by chance, on purpose: a line arrives as the shell grows by a pixel.
		await page.evaluate(async () => {
			const shell = document.querySelector<HTMLElement>('.ios-shell')!;
			const line = document.createElement('p');
			line.textContent = 'A line that arrives while the styles load.';
			shell.append(line);
			shell.style.paddingBottom = '1px';
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
			line.remove();
			shell.style.paddingBottom = '';
		});
		holding = false;
		await Promise.all(held.map((route) => route.continue()));
		await expect(page.locator('.ios-workspace')).toBeVisible();
		await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
		expect(consoleErrors).toEqual([]);
	});
});

test('the workspace never scrolls, whatever control takes the focus', async ({ page }) => {
	await openApp(page, '/shoot');
	await page.locator('.ios-workspace').waitFor();
	const workspace = page.locator('.ios-workspace');
	const count = await page.evaluate(() => document.querySelectorAll('.ios-workspace :is(button, a, input, [tabindex])').length);
	expect(count).toBeGreaterThan(5);
	for (let i = 0; i < count; i++) {
		await page.evaluate((n) => {
			const el = document.querySelectorAll<HTMLElement>('.ios-workspace :is(button, a, input, [tabindex])')[n];
			el.focus();
			el.scrollIntoView();
		}, i);
		expect(await workspace.evaluate((el) => [el.scrollTop, el.scrollLeft])).toEqual([0, 0]);
	}
});

test('Escape closes the take sheet, then the keypad', async ({ page }) => {
	test.skip(page.viewportSize()!.width < 700, 'a hardware keyboard is an iPad case');
	await openApp(page, '/shoot');
	await page.locator('.ios-workspace').waitFor();
	await page.getByRole('button', { name: /^(Add Note|Note:)/ }).first().tap();
	const sheet = page.getByRole('dialog', { name: /^Take / });
	await expect(sheet).toBeVisible();
	// Escape is taken once the sheet has come up.
	await page.waitForTimeout(400);
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();

	await page.getByRole('button', { name: /^Cam A, Focus,/ }).tap();
	const keypad = page.getByRole('group', { name: 'Number keypad' });
	await expect(keypad).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(keypad).toBeHidden();
});
