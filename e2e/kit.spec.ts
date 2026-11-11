// The kit's frame and layers, on the take screen (Shoot, sample project): the Workspace never scrolls, and
// Escape closes only the top layer.
import { expect, openApp, test } from './fixtures';

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
