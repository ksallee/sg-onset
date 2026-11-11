// The take screen prototype (#1), on mock data. Role and label selectors only: the markup moves.
import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

const PATH = '/proto/take';

const rail = (page: Page) => page.getByRole('toolbar', { name: 'Capture' });
const recordButton = (page: Page) => rail(page).getByRole('button', { name: /^(Record|Cut)\b/ });
/** The take's phase: the status line that starts with the phase word. */
const phase = (page: Page, word: string) => page.getByRole('status').filter({ hasText: new RegExp(`^\\s*${word}`) });

/** The take number on screen, from the page title (`Take <slate>/<take> · sg-onset`). */
async function takeNumber(page: Page): Promise<number> {
	const m = /\/(\d+)\b/.exec(await page.title());
	if (!m) throw new Error(`no take number in the title "${await page.title()}"`);
	return Number(m[1]);
}

/** Pure-white pixels in a sample of a screenshot of the page, decoded in the page itself. */
async function whitePixels(page: Page): Promise<number> {
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
		let count = 0;
		// Every 7th pixel: cheap, and enough to catch white text or a white panel.
		for (let i = 0; i < px.length; i += 4 * 7) if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) count++;
		return count;
	}, png);
}

test.describe('take screen', () => {
	test('loads with the rail and no console errors', async ({ page }) => {
		await open(page, PATH);
		await expect(rail(page)).toBeVisible();
		await expect(recordButton(page)).toBeVisible();
		await expect(phase(page, 'Ready')).toBeVisible();
	});

	test('Record rolls, a second press files the take', async ({ page }) => {
		await open(page, PATH);
		await recordButton(page).tap();
		await expect(phase(page, 'Rolling')).toBeVisible();
		await expect(rail(page).getByRole('button', { name: /^Cut\b/ })).toBeVisible();
		await recordButton(page).tap();
		await expect(phase(page, 'Filed')).toBeVisible();
	});

	test('New take adds one, Undo takes it back', async ({ page }) => {
		await open(page, PATH);
		const before = await takeNumber(page);
		await rail(page).getByRole('button', { name: 'New take' }).tap();
		await expect.poll(() => takeNumber(page)).toBe(before + 1);
		await rail(page).getByRole('button', { name: 'Undo' }).tap();
		await expect.poll(() => takeNumber(page)).toBe(before);
	});

	test('a number opens the keypad, typing commits, a recent chip sets', async ({ page }) => {
		await open(page, PATH);
		const cell = page.getByRole('button', { name: /^Camera A, Focus,/ });
		await cell.tap();
		const keypad = page.getByRole('group', { name: 'Number keypad' });
		await expect(keypad).toBeVisible();

		await keypad.getByRole('button', { name: '3', exact: true }).tap();
		await keypad.getByRole('button', { name: '7', exact: true }).tap();
		await page.getByRole('button', { name: 'Done', exact: true }).tap();
		await expect(keypad).toBeHidden();
		await expect(cell).toHaveAccessibleName(/^Camera A, Focus, 37(\.0+)? m$/);

		await cell.tap();
		const chips = page.getByRole('group', { name: 'Recent' }).getByRole('button', { pressed: false });
		await expect(chips.first()).toBeVisible();
		const value = (await chips.first().innerText()).trim();
		await chips.first().tap();
		await page.getByRole('button', { name: 'Done', exact: true }).tap();
		await expect(cell).toHaveAccessibleName(new RegExp(`^Camera A, Focus, ${value.replace('.', '\\.')}(0*)? m$`));
	});

	test('?hand=left puts the rail on the other edge', async ({ page }) => {
		const width = page.viewportSize()!.width;
		const centre = async () => {
			const b = (await recordButton(page).boundingBox())!;
			return b.x + b.width / 2;
		};
		await open(page, PATH);
		const right = await centre();
		await open(page, `${PATH}?hand=left`);
		const left = await centre();
		expect(right, 'right hand: Record on the right half').toBeGreaterThan(width / 2);
		expect(left, 'left hand: Record on the left half').toBeLessThan(width / 2);
		// Mirrored: about as far from the left edge as it was from the right.
		expect(Math.abs(left - (width - right))).toBeLessThan(width * 0.1);
	});

	test('?theme=night has no pure white on screen', async ({ page }) => {
		// The control first: Day has white, so the check can see it.
		await open(page, `${PATH}?theme=day`);
		await expect(rail(page)).toBeVisible();
		expect(await whitePixels(page), 'Day: pure-white pixels sampled').toBeGreaterThan(0);

		await open(page, `${PATH}?theme=night`);
		await expect(rail(page)).toBeVisible();
		expect(await whitePixels(page), 'Night: pure-white pixels sampled').toBe(0);
	});

	test('Photo takes a file and a still appears', async ({ page }) => {
		await open(page, PATH);
		// A 1×1 PNG. Photo opens the native camera through a file input: here, a file chooser.
		const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/0ZbC9wAAAABJRU5ErkJggg==', 'base64');
		const [chooser] = await Promise.all([page.waitForEvent('filechooser'), rail(page).getByRole('button', { name: 'Photo' }).tap()]);
		await chooser.setFiles({ name: 'still.png', mimeType: 'image/png', buffer: png });
		await expect(page.getByRole('img', { name: /^Still 1 of take/ })).toBeVisible();
		await expect(rail(page).getByRole('button', { name: 'Photo' })).toContainText('1');
	});
});
