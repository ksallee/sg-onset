// Records the app for the demo video: Chromium at the iPad landscape size, dark, the sample project.
// Chromium, not WebKit: Playwright's WebKit session refuses Blobs, so no photo would be stored, and
// the CDP screencast gives frames at device pixels (2x), sharper than Playwright's own video.
// Returns the frames and the captions, each with its time in seconds.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { targetFor } from '../../e2e/targets.mjs';

/** Tap marks, so a viewer sees where a finger went. Nothing here takes a pointer. */
function tapMarks() {
	const mount = () => {
		const root = document.documentElement;
		const style = document.createElement('style');
		style.textContent = `.demo-tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;z-index:2147483647;
			pointer-events:none;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.8);animation:demo-tap .55s ease-out forwards}
			@keyframes demo-tap{from{transform:scale(.6);opacity:1}to{transform:scale(1.5);opacity:0}}`;
		root.appendChild(style);
		let last = 0;
		const mark = (x, y) => {
			if (performance.now() - last < 120) return;
			last = performance.now();
			const d = document.createElement('div');
			d.className = 'demo-tap';
			d.style.left = x + 'px';
			d.style.top = y + 'px';
			root.appendChild(d);
			setTimeout(() => d.remove(), 700);
		};
		addEventListener('touchstart', (e) => mark(e.touches[0].clientX, e.touches[0].clientY), { capture: true, passive: true });
		addEventListener('pointerdown', (e) => mark(e.clientX, e.clientY), { capture: true, passive: true });
	};
	if (document.documentElement) mount();
	else addEventListener('DOMContentLoaded', mount);
}

/** A stand-in reference photo when none is given: sky, road, a grey ball and a chrome ball. */
function drawnPhoto() {
	const c = document.createElement('canvas');
	c.width = 1600;
	c.height = 1200;
	const g = c.getContext('2d');
	const sky = g.createLinearGradient(0, 0, 0, 700);
	sky.addColorStop(0, '#5d7896');
	sky.addColorStop(1, '#c9b79a');
	g.fillStyle = sky;
	g.fillRect(0, 0, 1600, 700);
	const road = g.createLinearGradient(0, 700, 0, 1200);
	road.addColorStop(0, '#4b4a48');
	road.addColorStop(1, '#2a2a29');
	g.fillStyle = road;
	g.fillRect(0, 700, 1600, 500);
	g.fillStyle = '#d9d2c0';
	g.fillRect(0, 960, 1600, 14);
	const ball = (x, y, r, a, b) => {
		const s = g.createRadialGradient(x - r / 3, y - r / 3, r / 8, x, y, r);
		s.addColorStop(0, a);
		s.addColorStop(1, b);
		g.fillStyle = s;
		g.beginPath();
		g.arc(x, y, r, 0, 7);
		g.fill();
	};
	ball(640, 640, 90, '#b8b8b8', '#4a4a4a');
	ball(900, 640, 90, '#ffffff', '#20262e');
	g.fillStyle = '#3a3a3a';
	g.fillRect(760, 730, 20, 300);
	return c.toDataURL('image/png').split(',')[1];
}

/**
 * @param {string} base  the app's URL, a production build
 * @param {string} out  folder for frames/
 * @param {{ name: string; mimeType: string; buffer: Buffer } | null} photo
 */
export async function record(base, out, photo) {
	const frames = join(out, 'frames');
	rmSync(frames, { recursive: true, force: true });
	mkdirSync(frames, { recursive: true });

	const ipad = targetFor('ipad-landscape');
	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: ipad.width, height: ipad.height },
		deviceScaleFactor: ipad.scale,
		isMobile: true,
		hasTouch: true,
		userAgent: ipad.userAgent,
		colorScheme: 'dark',
		baseURL: base
	});
	// The app's stored settings (lib/app/settings.ts): dark, right hand.
	await context.addInitScript(() => {
		const key = 'sg-onset.settings';
		localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), appearance: 'dark', night: false, hand: 'right' }));
	});
	await context.addInitScript(tapMarks);

	const page = await context.newPage();
	page.on('pageerror', (e) => console.error('pageerror:', e.message));
	const wait = (ms) => page.waitForTimeout(ms);
	const settled = () => page.waitForFunction(() => !document.documentElement.dataset.nav);
	const nav = async (name) => {
		await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name, exact: true }).tap();
		await settled();
		await wait(500);
	};
	const type = async (field, text, delay = 70) => {
		await field.tap();
		await field.press('ControlOrMeta+a');
		await field.pressSequentially(text, { delay });
	};
	const caps = [];
	const cap = (text) => caps.push({ wall: Date.now() / 1000, text });

	try {
		// ---- Off camera: the sample project, a live template with three slates, one changed by hand.
		await page.goto('/');
		await page.waitForURL(/\/(welcome|shoot)$/);
		if (page.url().endsWith('/welcome')) {
			await page.getByRole('button', { name: 'Load the Sample Project' }).tap();
			await page.waitForURL(/\/shoot$/);
		}
		const description = page.getByRole('textbox', { name: 'Description' });
		await page.goto('/templates');
		await page.getByRole('button', { name: 'New Template' }).first().tap();
		await page.getByRole('menuitem', { name: 'New Slate Template' }).tap();
		await page.waitForURL(/\/templates\/[0-9a-f-]+$/);
		await settled();
		await page.getByRole('textbox', { name: 'Name' }).fill('Rain plate');
		await page.getByRole('textbox', { name: 'Scene' }).fill('50');
		await page.getByRole('textbox', { name: 'Scene' }).blur();
		await description.fill('Plate');
		await description.blur();
		await page.getByRole('button', { name: 'Save' }).first().tap();
		await page.getByRole('heading', { name: 'Rain plate', level: 1 }).waitFor();
		const ids = [];
		for (const name of ['50', '50A', '50B']) {
			await page.goto('/slates');
			await page.getByRole('button', { name: 'New Slate' }).first().tap();
			const sheet = page.getByRole('dialog', { name: 'New Slate' });
			await sheet.getByRole('combobox', { name: 'Template' }).selectOption({ label: 'Rain plate' });
			await sheet.getByRole('button', { name: 'Create' }).tap();
			await page.getByRole('heading', { name: `Slate ${name}`, level: 1, exact: true }).waitFor();
			await settled();
			ids.push(page.url().split('/').pop());
		}
		await page.goto(`/slates/${ids[1]}`);
		await description.fill('Hand typed');
		await description.blur();
		await page.getByText('Changed here: Description.', { exact: false }).waitFor();

		await page.goto('/shoot');
		await page.getByRole('navigation', { name: 'Sections' }).waitFor();
		const change = page.getByRole('button', { name: /^Change Slate/ });
		if (await change.count()) await change.tap();
		await page.getByRole('button', { name: /^Slate 42A(?!,)\b/ }).tap();
		await page.getByRole('button', { name: 'Slate 42A, take 3' }).waitFor();
		await wait(800);
		const picture = photo ?? { name: 'set.png', mimeType: 'image/png', buffer: Buffer.from(await page.evaluate(drawnPhoto), 'base64') };

		// ---- On camera.
		const cdp = await context.newCDPSession(page);
		const shots = [];
		let n = 0;
		cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
			const file = join(frames, `f${String(n++).padStart(5, '0')}.jpg`);
			writeFileSync(file, Buffer.from(data, 'base64'));
			shots.push({ file, t: metadata.timestamp });
			await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
		});
		await cdp.send('Page.startScreencast', {
			format: 'jpeg',
			quality: 92,
			maxWidth: ipad.width * ipad.scale,
			maxHeight: ipad.height * ipad.scale,
			everyNthFrame: 1
		});
		await wait(400);

		// 1. Log takes.
		cap('Log a take in one press');
		const rail = page.getByRole('toolbar', { name: 'Capture' });
		await wait(700);
		await rail.getByRole('button', { name: /^Start\b/ }).tap();
		await wait(2600);
		await rail.getByRole('button', { name: /^End\b/ }).tap();
		await wait(700);
		await page.getByRole('button', { name: /^Circled/ }).first().tap();
		await wait(700);
		await page.getByRole('button', { name: /^Cam A, Focus,/ }).tap();
		await wait(500);
		const keypad = page.getByRole('group', { name: 'Number keypad' });
		for (const k of ['3', 'Point', '5']) {
			await keypad.getByRole('button', { name: k, exact: true }).tap();
			await wait(260);
		}
		await page.getByRole('button', { name: 'Done', exact: true }).tap();
		await wait(900);

		// 2. Draw on a photo.
		cap('Draw, write and measure on photos');
		const [chooser] = await Promise.all([page.waitForEvent('filechooser'), rail.getByRole('button', { name: 'Photo' }).tap()]);
		await chooser.setFiles(picture);
		const open = page.getByRole('button', { name: 'Draw on photo 1' });
		await open.waitFor();
		await wait(700);
		await open.tap();
		const cover = page.getByRole('dialog', { name: /^Photo 1 of Take / });
		const canvas = page.getByRole('img', { name: 'Photo 1 and its drawing' });
		await canvas.waitFor();
		await wait(600);
		const box = await canvas.boundingBox();
		const at = (x, y) => [box.x + box.width * x, box.y + box.height * y];
		const stroke = async (pts, step = 6) => {
			await page.mouse.move(...at(...pts[0]));
			await page.mouse.down();
			for (let i = 1; i < pts.length; i++) {
				const [a, b] = [at(...pts[i - 1]), at(...pts[i])];
				for (let s = 1; s <= step; s++) {
					await page.mouse.move(a[0] + ((b[0] - a[0]) * s) / step, a[1] + ((b[1] - a[1]) * s) / step);
					await wait(12);
				}
			}
			await page.mouse.up();
		};
		// A ring around the grey ball of the drawn photo.
		const ring = Array.from({ length: 19 }, (_, i) => {
			const a = (i / 18) * Math.PI * 2;
			return [0.4 + Math.cos(a) * 0.085, 0.533 + Math.sin(a) * 0.11];
		});
		await stroke(ring, 3);
		await wait(500);
		await cover.getByRole('radio', { name: 'Measure' }).tap();
		await wait(300);
		await stroke([[0.36, 0.86], [0.6, 0.86]], 10);
		const value = page.getByRole('dialog', { name: 'Measurement' });
		await value.waitFor();
		await wait(300);
		await type(value.getByRole('textbox', { name: 'Length' }), '2.5 m', 90);
		await wait(300);
		await value.getByRole('button', { name: 'Done' }).tap();
		await wait(500);
		await cover.getByRole('radio', { name: 'Text' }).tap();
		await page.mouse.click(...at(0.3, 0.33));
		const words = page.getByRole('dialog', { name: 'Text' });
		await words.waitFor();
		await type(words.getByRole('textbox', { name: 'Text' }), 'Grey ball', 70);
		await words.getByRole('button', { name: 'Done' }).tap();
		await wait(1400);
		await cover.getByRole('button', { name: 'Done' }).tap();
		await wait(700);

		// 3. Bulk edit.
		cap('Bulk edit many takes at once');
		await nav('Slates');
		await page.getByRole('link', { name: /^42A/ }).tap();
		await page.getByRole('heading', { name: 'Slate 42A', level: 1 }).waitFor();
		await wait(700);
		await page.getByRole('checkbox', { name: 'Select take 1, A' }).tap();
		await wait(400);
		await page.getByRole('button', { name: 'Range' }).tap();
		await wait(300);
		await page.getByRole('checkbox', { name: 'Select take 4, A' }).tap();
		await wait(600);
		await page.getByRole('toolbar').getByRole('button', { name: 'Edit' }).tap();
		const sheet = page.getByRole('dialog', { name: /^Edit \d+ Takes$/ });
		await sheet.waitFor();
		await wait(600);
		await sheet.getByRole('button', { name: /^T-stop/ }).tap();
		await wait(400);
		await type(sheet.getByRole('textbox', { name: 'T-stop' }), '5.6', 120);
		await wait(700);
		await sheet.getByRole('button', { name: /^Set on \d+ Takes$/ }).tap();
		await wait(1600);

		// 4. Live templates.
		cap('Live templates. A value typed by hand stays.');
		await nav('Templates');
		await page.getByRole('link', { name: /Rain plate/ }).first().tap();
		await page.getByRole('heading', { name: 'Rain plate', level: 1 }).waitFor();
		await settled();
		await wait(700);
		await description.tap();
		await description.press('End');
		await description.pressSequentially(', wet', { delay: 90 });
		await description.blur();
		await wait(400);
		await page.getByRole('button', { name: 'Save' }).first().tap();
		const review = page.getByRole('dialog', { name: 'Save Template' });
		await review.waitFor();
		await wait(2600);
		await review.getByRole('button', { name: 'Save and Update' }).tap();
		await wait(1200);

		// 5. Gear library.
		cap('Built-in cameras and lenses');
		await nav('Gear');
		await page.getByRole('button', { name: 'Add from Library' }).first().tap();
		const library = page.getByRole('dialog', { name: 'Gear Library' });
		await library.waitFor();
		await wait(500);
		await type(library.getByRole('searchbox'), 'venice 2', 80);
		await wait(500);
		await library.getByRole('button', { name: /^VENICE 2 8K/ }).tap();
		await wait(500);
		await library.getByRole('button', { name: /^8\.6K 3:2/ }).tap();
		await wait(500);
		await library.getByRole('radio', { name: 'Lenses' }).tap();
		await type(library.getByRole('searchbox'), 'signature prime', 60);
		await wait(400);
		await library.getByRole('button', { name: /^ARRI Signature Prime/ }).tap();
		await wait(400);
		await library.getByRole('button', { name: /^Whole Set/ }).tap();
		await wait(800);
		await library.getByRole('button', { name: /^Add \d+$/ }).tap();
		await wait(1400);

		// 6. Wrap.
		cap('Wrap the day: reports and a package for VFX');
		await nav('Wrap');
		await wait(2000);
		await page.getByRole('link', { name: /^Day Report/ }).tap();
		await page.getByRole('heading', { name: 'Sample project', level: 1 }).waitFor();
		await wait(1200);
		await page.mouse.wheel(0, 500);
		await wait(1600);
		cap('');
		await cdp.send('Page.stopScreencast');
		await wait(300);

		if (!shots.length) throw new Error('the screencast sent no frames');
		const t0 = Math.min(...shots.map((s) => s.t));
		return { shots, caps: caps.map((c) => ({ t: c.wall - t0, text: c.text })) };
	} finally {
		await browser.close();
	}
}
