// The layout audit (audit.ts) on every page there is, plus a screenshot of each for the report.
import { auditLayout } from './audit';
import { open, openApp, test } from './fixtures';

const OUT = process.env.E2E_OUT ?? '.qa';

// Pages that stand alone, and pages in the shell (they need a project: the sample).
const PAGES = ['/welcome', '/proto/take', '/proto/take?hand=left', '/proto/take?theme=night', '/proto/take?gloves=1'];
const APP_PAGES = ['/shoot', '/slates', '/gear', '/templates', '/settings', '/sign-in'];

const slug = (path: string) => path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || 'home';

test.describe('layout', () => {
	for (const path of PAGES) {
		test(`audit ${path}`, async ({ page }, testInfo) => {
			await open(page, path);
			await page.screenshot({ path: `${OUT}/shots/${testInfo.project.name}/${slug(path)}.png` });
			await auditLayout(page, testInfo, path);
		});
	}

	for (const path of APP_PAGES) {
		test(`audit ${path}`, async ({ page }, testInfo) => {
			await openApp(page, path);
			await page.screenshot({ path: `${OUT}/shots/${testInfo.project.name}/${slug(path)}.png` });
			await auditLayout(page, testInfo, path);
		});
	}

	test('audit /proto/take with the keypad open', async ({ page }, testInfo) => {
		await open(page, '/proto/take');
		await page.getByRole('button', { name: /^Camera A, Focus,/ }).tap();
		await page.getByRole('group', { name: 'Number keypad' }).waitFor();
		await page.screenshot({ path: `${OUT}/shots/${testInfo.project.name}/proto-take-keypad.png` });
		await auditLayout(page, testInfo, '/proto/take (keypad)');
	});
});
