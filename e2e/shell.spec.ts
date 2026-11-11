// The app shell: the first run, the navigation on each target, the settings on <html>, an edit
// with its undo, the sync detail. On real stored data: each test starts on an empty device.
import { expect, open, openApp, test } from './fixtures';

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Sections' });
const root = (page: import('@playwright/test').Page) => page.locator('html');

test.describe('first run', () => {
	test('a device with no project lands on the first run', async ({ page }) => {
		await open(page, '/');
		await expect(page).toHaveURL(/\/welcome$/);
		await expect(page.getByRole('button', { name: 'Start' })).toBeDisabled();
	});

	test('a project and a shoot day lead to its slates, and a blank slate can be made and shot', async ({ page }) => {
		await open(page, '/welcome');
		await page.getByRole('textbox', { name: 'Name' }).fill('The Long Night');
		await page.getByRole('button', { name: 'Start' }).tap();
		await expect(page).toHaveURL(/\/slates$/);
		await expect(page.getByRole('heading', { name: 'No Slates' })).toBeVisible();

		await page.getByRole('button', { name: 'New Slate' }).first().tap();
		const name = page.getByRole('dialog', { name: 'New Slate' }).getByRole('textbox', { name: 'Slate' });
		await expect(name).toHaveValue('1');
		await name.fill('42A');
		await page.getByRole('button', { name: 'Create' }).tap();
		await expect(page).toHaveURL(/\/slates\/[0-9a-f-]+$/);

		await page.getByRole('button', { name: 'Shoot This Slate' }).tap();
		await expect(page).toHaveURL(/\/shoot$/);
		await expect(page.getByText('Slate 42A')).toBeVisible();
	});

	test('the sample project loads through the store and survives a reload', async ({ page }) => {
		await openApp(page, '/slates');
		await expect(page.getByRole('link', { name: /42A/ })).toBeVisible();
		await page.reload();
		await expect(page.getByRole('link', { name: /42A/ })).toBeVisible();
		await expect(page.getByText('Sample project').first()).toBeVisible();
	});
});

test.describe('navigation', () => {
	test('reaches the five destinations', async ({ page }) => {
		await openApp(page, '/shoot');
		for (const [name, heading] of [['Slates', 'Slates'], ['Gear', 'Gear'], ['Templates', 'Templates'], ['Settings', 'Settings'], ['Shoot', 'Shoot']]) {
			await nav(page).getByRole('link', { name, exact: true }).tap();
			await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
			await expect(nav(page).getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
		}
	});

	test('is never on the holding hand\'s edge nor along the foot, and mirrors with the hand', async ({ page }) => {
		await openApp(page, '/settings');
		const viewport = page.viewportSize()!;
		const place = async () => {
			const box = (await nav(page).boundingBox())!;
			return { left: box.x < 1, right: box.x + box.width > viewport.width - 1, top: box.y < 1, foot: box.y + box.height > viewport.height - 1 && box.y > viewport.height / 2 };
		};
		const wide = viewport.width >= 1000;

		// Right hand: the rail's edge is the right one.
		let at = await place();
		expect(at.foot).toBe(false);
		expect(at.top).toBe(true);
		if (wide) expect(at).toMatchObject({ left: true, right: false });

		await page.getByRole('radio', { name: 'Left', exact: true }).tap();
		await expect(root(page)).toHaveAttribute('data-hand', 'left');
		at = await place();
		expect(at.foot).toBe(false);
		if (wide) expect(at).toMatchObject({ left: false, right: true });
	});

	test('the sidebar keeps its width on Shoot apart from the rest, and both last', async ({ page }) => {
		test.skip(page.viewportSize()!.width < 1000, 'a sidebar only in landscape');
		const expand = () => nav(page).getByRole('button', { name: 'Show the names' });
		const collapse = () => nav(page).getByRole('button', { name: 'Hide the names' });
		const width = async () => (await nav(page).boundingBox())!.width;

		await openApp(page, '/slates');
		await expect(collapse()).toBeVisible();
		const open = await width();

		// Shoot starts as a strip, with the button there.
		await nav(page).getByRole('link', { name: 'Shoot', exact: true }).tap();
		await expect(expand()).toBeVisible();
		expect(await width()).toBeLessThan(open);

		// Elsewhere stays open after a visit to Shoot.
		await nav(page).getByRole('link', { name: 'Gear', exact: true }).tap();
		await expect(collapse()).toBeVisible();
		expect(await width()).toBe(open);

		// Opened on Shoot, it stays open there, after a reload too.
		await nav(page).getByRole('link', { name: 'Shoot', exact: true }).tap();
		await expand().tap();
		await expect(collapse()).toBeVisible();
		await page.reload();
		await expect(collapse()).toBeVisible();
		expect(await width()).toBe(open);
	});

	test('a slate pushes over the list and the way back returns to it', async ({ page }) => {
		await openApp(page, '/slates');
		await page.getByRole('link', { name: /42A/ }).tap();
		await expect(page.getByRole('heading', { name: 'Slate 42A', level: 1 })).toBeVisible();
		await page.getByRole('link', { name: 'Slates' }).first().tap();
		await expect(page).toHaveURL(/\/slates$/);
	});
});

test.describe('settings', () => {
	test('are on <html>, and still there after a reload', async ({ page }) => {
		await openApp(page, '/settings');
		// The suite's device asks for light, and for motion.
		await expect(root(page)).toHaveAttribute('data-theme', 'light');
		await expect(root(page)).toHaveAttribute('data-motion', 'full');
		await expect(root(page)).not.toHaveAttribute('data-night', 'true');

		await page.getByRole('radio', { name: 'Dark', exact: true }).tap();
		await expect(root(page)).toHaveAttribute('data-theme', 'dark');
		await page.getByRole('switch', { name: 'Red night mode' }).tap();
		await expect(root(page)).toHaveAttribute('data-night', 'true');
		await expect(root(page)).not.toHaveClass(/ios-/);
		await page.getByRole('radio', { name: 'Reduced', exact: true }).tap();
		await expect(root(page)).toHaveAttribute('data-motion', 'reduced');
		await page.getByRole('radio', { name: 'Large', exact: true }).tap();
		await expect(root(page)).toHaveAttribute('data-button-size', 'large');

		await page.reload();
		await expect(root(page)).toHaveAttribute('data-night', 'true');
		await expect(root(page)).toHaveAttribute('data-theme', 'dark');
		await expect(root(page)).toHaveAttribute('data-motion', 'reduced');
	});

	test('red night mode wins over a light appearance', async ({ page }) => {
		await openApp(page, '/settings');
		await page.getByRole('radio', { name: 'Light', exact: true }).tap();
		await page.getByRole('switch', { name: 'Red night mode' }).tap();
		await expect(root(page)).toHaveAttribute('data-theme', 'dark');
		await expect(root(page)).toHaveAttribute('data-night', 'true');
	});
});

test.describe('edits', () => {
	test('a field typed on a slate is saved, said, and undone from the notice', async ({ page }) => {
		await openApp(page, '/slates');
		await page.getByRole('link', { name: /42B/ }).tap();
		const scene = page.getByRole('textbox', { name: 'Scene' });
		await expect(scene).toHaveValue('42');
		await scene.fill('43');
		await scene.blur();
		const notice = page.getByRole('status').filter({ hasText: 'Scene changed' });
		await expect(notice).toBeVisible();

		await page.reload();
		await expect(page.getByRole('textbox', { name: 'Scene' })).toHaveValue('43');

		await page.getByRole('textbox', { name: 'Scene' }).fill('44');
		await page.getByRole('textbox', { name: 'Scene' }).blur();
		await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
		await expect(page.getByRole('textbox', { name: 'Scene' })).toHaveValue('43');
	});

	test('a slate deleted with its takes comes back with Undo', async ({ page }) => {
		await openApp(page, '/slates');
		await page.getByRole('link', { name: /42A/ }).tap();
		await page.getByRole('button', { name: 'Delete Slate' }).tap();
		await expect(page).toHaveURL(/\/slates$/);
		await expect(page.getByRole('link', { name: /42A/ })).toHaveCount(0);
		await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
		await expect(page.getByRole('link', { name: /42A.*5 takes/ })).toBeVisible();
	});

	test('a required field cannot be emptied', async ({ page }) => {
		await openApp(page, '/slates');
		await page.getByRole('link', { name: /42A/ }).tap();
		const name = page.getByRole('textbox', { name: 'Slate' });
		await name.fill('');
		await name.blur();
		await expect(page.getByRole('alert')).toHaveText('This is needed.');
	});
});

test.describe('sync status', () => {
	test('counts what waits and opens the detail, with the backup', async ({ page }) => {
		await openApp(page, '/slates');
		const status = nav(page).getByRole('button', { name: /^Sync: Not signed in\. 25 waiting/ });
		await expect(status).toBeVisible();
		await status.tap();
		const detail = page.getByRole('dialog', { name: 'Sync' });
		await expect(detail.getByText('Waiting, by kind')).toBeVisible();
		await expect(detail.getByRole('link', { name: /Sign In/ })).toBeVisible();
		await detail.getByRole('button', { name: 'Export Backup' }).tap();
		await expect(detail.getByRole('button', { name: /Share or Save/ })).toBeVisible();
	});
});

// Motion (docs/design/motion.md): it never blocks a tap, lands where the last input says after
// rapid input, and under reduced motion nothing slides or scales.
test.describe('motion', () => {
	type Page = import('@playwright/test').Page;
	const stage = (page: Page) => page.locator('[data-page-stage]');
	const ghosts = (page: Page) => page.locator('[data-page-ghost]');

	/** Records, every frame until `stop`: animations of transform that last, the content's layout box. */
	async function sample(page: Page) {
		await page.evaluate(() => {
			const w = window as unknown as { __motion: { moving: number; boxes: Set<string>; on: boolean } };
			const state = (w.__motion = { moving: 0, boxes: new Set<string>(), on: true });
			const tick = () => {
				if (!state.on) return;
				// A transition of 0.01 ms (the reduced rule in motion.css) is no motion.
				const moving = document.getAnimations().filter((a) => {
					const effect = a.effect as KeyframeEffect | null;
					return a.playState === 'running' && Number(effect?.getTiming().duration ?? 0) > 1 && JSON.stringify(effect?.getKeyframes() ?? []).includes('transform');
				});
				if (moving.length) state.moving++;
				const content = document.querySelector('[data-page-stage]')?.parentElement;
				if (content) state.boxes.add(`${content.offsetLeft},${content.offsetWidth}`);
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		return () =>
			page.evaluate(() => {
				const state = (window as unknown as { __motion: { moving: number; boxes: Set<string>; on: boolean } }).__motion;
				state.on = false;
				return { moving: state.moving, boxes: state.boxes.size };
			});
	}
	/** Nothing is moving any more: no animation running, no picture of an old page left. */
	async function settled(page: Page) {
		await expect(ghosts(page)).toHaveCount(0);
		await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
		await expect.poll(() => stage(page).evaluate((el) => getComputedStyle(el).transform)).toBe('none');
	}

	test('a tap during a push lands at once, and nothing is left over', async ({ page }) => {
		await openApp(page, '/slates');
		// All Takes pushes on every screen (a slate opens beside the list on a wide one).
		await page.getByRole('link', { name: /All Takes/ }).tap();
		await expect(page).toHaveURL(/\/slates\/takes$/);
		await nav(page).getByRole('link', { name: 'Gear', exact: true }).tap();
		await expect(page).toHaveURL(/\/gear$/);
		await expect(page.getByRole('heading', { name: 'Gear', level: 1 })).toBeVisible();
		await settled(page);
	});

	test('back during a push turns it around and ends on the list', async ({ page }) => {
		await openApp(page, '/slates');
		const list = page.url();
		await page.getByRole('link', { name: /All Takes/ }).tap();
		await expect(page).toHaveURL(/\/slates\/takes$/);
		await page.goBack({ waitUntil: 'commit' });
		await expect(page).toHaveURL(list);
		await expect(page.getByRole('link', { name: /All Takes/ })).toBeVisible();
		await settled(page);
	});

	test('rapid changes of destination end on the last one, with its item marked', async ({ page }) => {
		await openApp(page, '/slates');
		for (const name of ['Gear', 'Templates', 'Settings', 'Slates', 'Templates']) {
			await nav(page).getByRole('link', { name, exact: true }).tap({ noWaitAfter: true });
		}
		await expect(page).toHaveURL(/\/templates$/);
		await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible();
		await expect(nav(page).getByRole('link', { name: 'Templates', exact: true })).toHaveAttribute('aria-current', 'page');
		await settled(page);
		// The mark of the current item sits on it.
		const item = (await nav(page).getByRole('link', { name: 'Templates', exact: true }).boundingBox())!;
		const mark = (await nav(page).locator('li[aria-hidden="true"]').boundingBox())!;
		expect(Math.abs(mark.x - item.x) + Math.abs(mark.y - item.y) + Math.abs(mark.width - item.width)).toBeLessThan(2);
	});

	test('the sidebar ends where the last tap says, its page laid out once per tap', async ({ page }) => {
		test.skip(page.viewportSize()!.width < 1000, 'a sidebar only in landscape');
		await openApp(page, '/gear');
		const toggle = nav(page).getByRole('button', { name: /names$/ });
		const open = await toggle.getAttribute('aria-expanded');
		const stop = await sample(page);
		// Five taps, faster than the motion: each one turns it from where it is drawn.
		for (let i = 0; i < 5; i++) await toggle.tap({ noWaitAfter: true });
		await settled(page);
		const { boxes } = await stop();
		await expect(toggle).toHaveAttribute('aria-expanded', open === 'true' ? 'false' : 'true');
		// The page's box took two values (open, strip), never one per frame: no layout in flight.
		expect(boxes).toBeLessThanOrEqual(2);
		expect((await nav(page).boundingBox())!.width).toBeLessThan(120);
	});

	test('reduced motion: pages, sheets and the sidebar change with no transform in flight', async ({ page }) => {
		await openApp(page, '/settings');
		await page.getByRole('radio', { name: 'Reduced', exact: true }).tap();
		await expect(root(page)).toHaveAttribute('data-motion', 'reduced');
		const stop = await sample(page);
		await nav(page).getByRole('link', { name: 'Slates', exact: true }).tap();
		await expect(page.getByRole('link', { name: /All Takes/ })).toBeVisible();
		const list = page.url();
		await page.getByRole('link', { name: /All Takes/ }).tap();
		await expect(page).toHaveURL(/\/slates\/takes$/);
		await page.goBack();
		await expect(page).toHaveURL(list);
		await nav(page).getByRole('button', { name: /^Sync/ }).tap();
		await expect(page.getByRole('dialog', { name: 'Sync' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: 'Sync' })).toHaveCount(0);
		const toggle = nav(page).getByRole('button', { name: /names$/ });
		if (await toggle.count()) await toggle.tap();
		await settled(page);
		expect((await stop()).moving).toBe(0);
	});
});
