// Red night mode (#30): no user-facing screen sends out anything but red. Green or blue light, and
// white above all, ruins the crew's dark adaptation (docs/design/colour.md). Each page is
// screenshotted in night mode and sampled; a light-mode run of the same page is the control.
import type { Page } from '@playwright/test';
import { expect, open, openApp, test } from './fixtures';

const SETTINGS_KEY = 'sg-onset.settings';

/** Pixels in a sample of a screenshot with any green or blue in them, and the pure-white ones. */
async function lightCount(page: Page): Promise<{ notRed: number; white: number; sampled: number }> {
	const png = (await page.screenshot()).toString('base64');
	return page.evaluate(async (data) => {
		const img = new Image();
		img.src = `data:image/png;base64,${data}`;
		await img.decode();
		const canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(img, 0, 0);
		const px = ctx.getImageData(0, 0, img.width, img.height).data;
		let notRed = 0;
		let white = 0;
		let sampled = 0;
		// Every 5th pixel: cheap, and enough to catch a hairline, a glyph or a panel. A green or blue
		// channel over 4 is light that is not red (4 leaves room for the encoder's rounding).
		for (let i = 0; i < px.length; i += 4 * 5) {
			sampled++;
			if (px[i + 1] > 4 || px[i + 2] > 4) notRed++;
			if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) white++;
		}
		return { notRed, white, sampled };
	}, png);
}

/** Night mode on for every load of this page, whatever else the settings hold. */
async function night(page: Page, on: boolean) {
	await page.addInitScript(
		([key, value]) => {
			let s: Record<string, unknown> = {};
			try {
				s = JSON.parse(localStorage.getItem(key as string) ?? '{}') ?? {};
			} catch {
				// A bad value: start over.
			}
			localStorage.setItem(key as string, JSON.stringify({ ...s, night: value, appearance: value ? s.appearance : 'light' }));
		},
		[SETTINGS_KEY, on] as const
	);
}

/** The shell's pages, and the ones that stand alone. */
const SHELL = ['/shoot', '/slates', '/slates/s-42a', '/gear', '/templates', '/settings', '/sign-in'];
const ALONE = ['/welcome', '/proto/themes?mode=night'];

async function settle(page: Page) {
	// Fonts and the first paint of anything that fades in.
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(400);
}

test.describe('red night mode', () => {
	test('the check sees light: a light page has white and colour', async ({ page }) => {
		await night(page, false);
		await open(page, '/welcome');
		await settle(page);
		const seen = await lightCount(page);
		expect(seen.white, 'light: pure-white pixels sampled').toBeGreaterThan(0);
		expect(seen.notRed, 'light: pixels with green or blue').toBeGreaterThan(0);
	});

	for (const path of SHELL) {
		test(`${path} sends out only red`, async ({ page }) => {
			await night(page, true);
			await openApp(page, path === '/slates/s-42a' ? '/slates' : path);
			if (path === '/slates/s-42a') {
				await page.getByRole('link', { name: /42A/ }).first().tap();
				await page.getByRole('heading', { name: 'Slate 42A', level: 1 }).waitFor();
			}
			await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
			await settle(page);
			const seen = await lightCount(page);
			expect(seen.white, `${path}: pure-white pixels sampled`).toBe(0);
			expect(seen.notRed, `${path}: pixels with green or blue, of ${seen.sampled}`).toBe(0);
		});
	}

	// Gear with data on screen: a setup open (its badge, lens chip, order rows), a lens open, and
	// an import preview with a ready row, a warning, a left-out row and a duplicate.
	const GEAR: [string, (page: Page) => Promise<void>][] = [
		[
			'/gear, a camera setup open',
			async (page) => {
				await openApp(page, '/gear');
				await page.getByRole('button', { name: /^A\b/ }).first().tap();
				await page.getByRole('heading', { name: 'A', level: 2, exact: true }).waitFor();
			}
		],
		[
			'/gear, a lens open',
			async (page) => {
				await openApp(page, '/gear');
				await page.getByRole('button', { name: /^Angénieux Optimo/ }).first().tap();
				await page.getByRole('textbox', { name: 'Long end' }).waitFor();
			}
		],
		[
			'/gear/import, a preview',
			async (page) => {
				await openApp(page, '/gear/import?kind=lens');
				const csv = ['Make,Model,Serial,Focal,Colour', 'Zeiss,Supreme 25,Z25-1,25,red', ',,X2,50,', 'Zeiss,Supreme 35,Z35-1,wide,', 'Cooke,S4/i 32 mm T2,,32,'].join('\n');
				await page.getByRole('textbox', { name: 'Pasted text' }).fill(csv);
				await page.getByText('No model. The row was left out.').waitFor();
			}
		]
	];
	for (const [name, show] of GEAR) {
		test(`${name} sends out only red`, async ({ page }) => {
			await night(page, true);
			await show(page);
			await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
			await settle(page);
			const seen = await lightCount(page);
			expect(seen.white, `${name}: pure-white pixels sampled`).toBe(0);
			expect(seen.notRed, `${name}: pixels with green or blue, of ${seen.sampled}`).toBe(0);
		});
	}

	for (const path of ALONE) {
		test(`${path} sends out only red`, async ({ page }) => {
			await night(page, true);
			await open(page, path);
			await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
			await settle(page);
			const seen = await lightCount(page);
			expect(seen.white, `${path}: pure-white pixels sampled`).toBe(0);
			expect(seen.notRed, `${path}: pixels with green or blue, of ${seen.sampled}`).toBe(0);
		});
	}
});
