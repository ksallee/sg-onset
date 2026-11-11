// The kit's frame and layers, on the take screen prototype: the Workspace never scrolls, and
// Escape closes only the top layer.
import { expect, open, test } from './fixtures';

test('the workspace never scrolls, whatever control takes the focus', async ({ page }) => {
	await open(page, '/proto/take');
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

test('Escape closes the setup panel and leaves the keypad under it open', async ({ page }) => {
	test.skip(page.viewportSize()!.width < 700, 'a hardware keyboard is an iPad case; the phone form moves Setup to the list');
	await open(page, '/proto/take');
	await page.getByRole('button', { name: /^Camera A, Focus,/ }).tap();
	const keypad = page.getByRole('group', { name: 'Number keypad' });
	await expect(keypad).toBeVisible();
	await page.getByRole('toolbar', { name: 'Capture' }).getByRole('button', { name: 'Setup' }).tap();
	const panel = page.getByRole('region', { name: /^(Setup|Settings)$/ });
	await expect(panel).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(panel).toBeHidden();
	await expect(keypad).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(keypad).toBeHidden();
});
