// The take screen (Shoot) on stored data: the sample project, slate 42A of today. Role and label
// selectors only: the markup moves. Every test starts on an empty device.
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

const rail = (page: Page) => page.getByRole('toolbar', { name: 'Capture' });
const startEnd = (page: Page) => rail(page).getByRole('button', { name: /^(Start|End)\b/ });
/** The take's state: the status line that starts with the state word. */
const phase = (page: Page, word: string) => page.getByRole('status').filter({ hasText: new RegExp(`^\\s*${word}`) });
const keypad = (page: Page) => page.getByRole('group', { name: 'Number keypad' });
const key = (page: Page, k: string) => keypad(page).getByRole('button', { name: k, exact: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/0ZbC9wAAAABJRU5ErkJggg==', 'base64');

/** The take number on screen, from the page title (`Take <slate>/<take> · <app>`). */
async function takeNumber(page: Page): Promise<number> {
	const m = /\/(\d+)\b/.exec(await page.title());
	if (!m) throw new Error(`no take number in the title "${await page.title()}"`);
	return Number(m[1]);
}

/** Shoot on slate 42A of the sample, whatever was picked before. */
async function openShoot(page: Page, slate = '42A') {
	await openApp(page, '/shoot');
	const pick = page.getByRole('button', { name: new RegExp(`^Slate ${slate}(?!,)\\b`) });
	const change = page.getByRole('button', { name: /^Change Slate/ });
	await expect(pick.or(change).first()).toBeVisible();
	if (await change.count()) {
		if ((await change.getAttribute('aria-label'))?.endsWith(` ${slate}`)) return;
		await change.tap();
	}
	await pick.tap();
	await expect(rail(page)).toBeVisible();
}

/** Changes a setting the way the app keeps them, then reloads. */
async function setting(page: Page, patch: Record<string, unknown>) {
	await page.evaluate((p) => localStorage.setItem('sg-onset.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('sg-onset.settings') ?? '{}'), ...p })), patch);
	await page.reload();
	await expect(rail(page)).toBeVisible();
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
		for (let i = 0; i < px.length; i += 4 * 7) if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) count++;
		return count;
	}, png);
}

test.describe('take screen', () => {
	test('shows the slate, its takes and the rail', async ({ page }) => {
		await openShoot(page);
		await expect(startEnd(page)).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Takes' }).getByRole('button', { name: 'Slate 42A, take 3' })).toBeVisible();
		await expect(phase(page, 'Ended')).toBeVisible();
		await expect.poll(() => takeNumber(page)).toBe(3);
	});

	test('Start after an ended take makes the next take and runs it; End ends it; both survive a reload', async ({ page }) => {
		await openShoot(page);
		await expect(startEnd(page)).toHaveAccessibleName(/^Start Take 4$/);
		await startEnd(page).tap();
		await expect(phase(page, 'Running')).toBeVisible();
		await expect.poll(() => takeNumber(page)).toBe(4);
		await expect(rail(page).getByRole('button', { name: /^End\b/ })).toBeVisible();

		// The running state is the stored start time: a reload shows it.
		await page.reload();
		await expect(phase(page, 'Running')).toBeVisible();
		await expect.poll(() => takeNumber(page)).toBe(4);

		// The button takes no second press for half a second.
		await page.waitForTimeout(600);
		await startEnd(page).tap();
		await expect(phase(page, 'Ended')).toBeVisible();
		await page.reload();
		await expect(phase(page, 'Ended')).toBeVisible();
		await expect(page.getByRole('region', { name: 'Timing' }).or(page.getByText('End time')).first()).toBeVisible();
	});

	test('one Undo takes back one press', async ({ page }) => {
		await openShoot(page);
		await startEnd(page).tap();
		await expect.poll(() => takeNumber(page)).toBe(4);
		await rail(page).getByRole('button', { name: 'Undo' }).tap();
		await expect.poll(() => takeNumber(page)).toBe(3);
		await expect(phase(page, 'Ended')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Slate 42A, take 4' })).toHaveCount(0);
	});

	test('New Take adds one, ready; Undo on the notice takes it back', async ({ page }) => {
		await openShoot(page);
		await rail(page).getByRole('button', { name: 'New Take' }).tap();
		await expect.poll(() => takeNumber(page)).toBe(4);
		await expect(phase(page, 'Ready')).toBeVisible();
		await expect(startEnd(page)).toHaveAccessibleName(/^Start Take 4$/);
		const notice = page.getByRole('status').filter({ hasText: 'Take 4 added' });
		await notice.getByRole('button', { name: 'Undo' }).tap();
		await expect.poll(() => takeNumber(page)).toBe(3);
	});

	test('a number typed in the keypad is stored and survives a reload; a recent chip sets', async ({ page }) => {
		await openShoot(page);
		const cell = page.getByRole('button', { name: /^Cam A, Focus,/ });
		await cell.tap();
		await expect(keypad(page)).toBeVisible();
		await key(page, '3').tap();
		await key(page, '7').tap();
		await page.getByRole('button', { name: 'Done', exact: true }).tap();
		await expect(keypad(page)).toBeHidden();
		await expect(cell).toHaveAccessibleName(/^Cam A, Focus, 37 m$/);

		await page.reload();
		await expect(cell).toHaveAccessibleName(/^Cam A, Focus, 37 m$/);

		await cell.tap();
		const chip = page.getByRole('group', { name: 'Recent' }).getByRole('button', { name: '4.2', exact: true });
		await chip.tap();
		await page.getByRole('button', { name: 'Done', exact: true }).tap();
		await expect(cell).toHaveAccessibleName(/^Cam A, Focus, 4\.2 m$/);
	});

	test('a prime focal length is locked; Next walks the numbers that are typed', async ({ page }) => {
		await openShoot(page);
		await expect(page.getByRole('img', { name: /^Cam A, Focal, 32 mm, from the lens$/ })).toBeVisible();
		await page.getByRole('button', { name: /^Cam A, Focus,/ }).tap();
		await page.getByRole('button', { name: 'Next', exact: true }).tap();
		await expect(page.getByRole('region', { name: 'T-stop' })).toBeVisible();
	});

	test('Photo stores a photo on the take; it can be removed and put back', async ({ page, browserName }) => {
		// Playwright's WebKit runs in an ephemeral session, whose IndexedDB refuses Blobs. The failure
		// path is checked there; a stored photo on Safari is for a real iPad (README of the store).
		await openShoot(page);
		const [chooser] = await Promise.all([page.waitForEvent('filechooser'), rail(page).getByRole('button', { name: 'Photo' }).tap()]);
		await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
		const photo = page.getByRole('img', { name: 'Photo 1 of take 3' });
		if (browserName === 'webkit') {
			await expect(page.getByRole('status').filter({ hasText: 'The photo did not save.' })).toBeVisible();
			await expect(photo).toHaveCount(0);
			return;
		}
		await expect(photo).toBeVisible();
		await expect(rail(page).getByRole('button', { name: 'Photo' })).toContainText('1');

		await page.reload();
		await expect(photo).toBeVisible();

		await page.getByRole('button', { name: 'Remove photo 1' }).tap();
		await expect(photo).toHaveCount(0);
		await rail(page).getByRole('button', { name: 'Undo' }).tap();
		await expect(photo).toBeVisible();
	});

	test('Circled marks the take, again unmarks it', async ({ page }) => {
		await openShoot(page);
		const circled = page.getByRole('button', { name: 'Circled' });
		await expect(circled).toHaveAttribute('aria-pressed', 'false');
		await circled.tap();
		await expect(circled).toHaveAttribute('aria-pressed', 'true');
		await page.reload();
		await expect(circled).toHaveAttribute('aria-pressed', 'true');
		await circled.tap();
		await expect(circled).toHaveAttribute('aria-pressed', 'false');
	});

	test('a camera not on the take can be added to it', async ({ page }) => {
		await openShoot(page);
		await page.getByRole('button', { name: 'Add cam B to take 3' }).tap();
		await expect(page.getByRole('button', { name: /^Cam B, Focus,/ })).toBeVisible();
	});

	test('the left hand mirrors the rail', async ({ page }) => {
		const width = page.viewportSize()!.width;
		const centre = async () => {
			const b = (await startEnd(page).boundingBox())!;
			return b.x + b.width / 2;
		};
		await openShoot(page);
		const right = await centre();
		await setting(page, { hand: 'left' });
		const left = await centre();
		expect(right, 'right hand: Start on the right half').toBeGreaterThan(width / 2);
		expect(left, 'left hand: Start on the left half').toBeLessThan(width / 2);
		expect(Math.abs(left - (width - right))).toBeLessThan(width * 0.1);
	});

	test('red night mode has no pure white on screen', async ({ page }) => {
		await openShoot(page);
		await setting(page, { appearance: 'light', night: false });
		expect(await whitePixels(page), 'Light: pure-white pixels sampled').toBeGreaterThan(0);
		await setting(page, { night: true });
		expect(await whitePixels(page), 'Red night mode: pure-white pixels sampled').toBe(0);
	});
});

test.describe('empty states', () => {
	test('with no slate picked, the slates of the day to pick from', async ({ page }) => {
		await openShoot(page);
		await page.getByRole('button', { name: /^Change Slate/ }).tap();
		await expect(page.getByText('Pick a slate')).toBeVisible();
		await page.getByRole('button', { name: /^Slate 42B(?!,)\b/ }).tap();
		await expect(rail(page)).toBeVisible();
		await expect(page.getByRole('heading', { name: /slate 42B/ })).toBeAttached();
	});

	test('a new slate with no takes: Start makes take 1 on every camera', async ({ page }) => {
		await openApp(page, '/slates');
		await page.getByRole('button', { name: 'New Slate' }).first().tap();
		await page.getByRole('dialog', { name: 'New Slate' }).getByRole('textbox', { name: 'Slate' }).fill('77');
		await page.getByRole('button', { name: 'Create' }).tap();
		await page.getByRole('button', { name: 'Shoot This Slate' }).tap();
		await expect(page).toHaveURL(/\/shoot$/);
		await expect(page.getByText('No take yet. Start makes take 1.').first()).toBeVisible();
		await expect(startEnd(page)).toHaveAccessibleName(/^Start Take 1$/);
		await startEnd(page).tap();
		await expect(phase(page, 'Running')).toBeVisible();
		await expect(page.getByRole('button', { name: /^Cam A, Focus,/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Cam B, Focus,/ })).toBeVisible();
	});
});
