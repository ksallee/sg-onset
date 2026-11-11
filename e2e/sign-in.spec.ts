// Sign-in, without a Flow PT site: bad sites are refused here or by this app's own server, and
// nothing leaves localhost. Every request off localhost is aborted as well as recorded, so a slip
// can never reach a real site.
import { expect, isLocal, open, test } from './fixtures';

test.describe('sign-in', () => {
	// This app's server refuses a site off the allowlist with a 403, and the browser logs it.
	test.use({ ignoreConsole: [/status of 403/] });

	test.beforeEach(async ({ context }) => {
		await context.route((url) => !isLocal(url.href), (route) => route.abort('blockedbyclient'));
	});

	test('loads', async ({ page }) => {
		await open(page, '/sign-in');
		await expect(page.getByRole('textbox', { name: 'Flow PT site' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
	});

	for (const site of ['http://evil.example', '192.168.1.10', 'https://evil.example']) {
		test(`refuses ${site}, and asks nobody but localhost`, async ({ page, offsite }) => {
			await open(page, '/sign-in');
			await page.getByRole('textbox', { name: 'Flow PT site' }).fill(site);
			await page.getByRole('button', { name: 'Continue' }).tap();
			const alert = page.getByRole('alert');
			await expect(alert).toBeVisible();
			await expect(alert).not.toBeEmpty();
			expect(offsite).toEqual([]);
		});
	}
});
