// Composes the square video: title card, the app in its rounded frame with a caption above, end
// card. The cards, captions, background and frame mask are drawn by the browser, so the type
// matches the app; ffmpeg puts them together.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { LAYOUT, captionSpans, concatList, duration, filterGraph } from './plan.mjs';

const TITLE = 2.6;
const END = 3.6;
const XFADE = 0.5;
const TAIL = 0.5;

const S = LAYOUT.size;
const APP = LAYOUT.app;
const R = LAYOUT.radius;
const FONT = `font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;`;
const BACKDROP = 'radial-gradient(120% 80% at 50% 0%, #1b1d22 0%, #0b0b0c 60%)';
const page = (body, bg = 'transparent') =>
	`<!doctype html><html><body style="margin:0;width:${S}px;height:${S}px;background:${bg};${FONT}color:#fff;overflow:hidden">${body}</body></html>`;
const card = (inner) =>
	page(`<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:22px">${inner}</div>`, BACKDROP);
const NAME = `<div style="font-size:104px;font-weight:800;letter-spacing:-2px">SG OnSet</div>`;

/**
 * @param {{ shots: { file: string; t: number }[]; caps: { t: number; text: string }[] }} take  from record()
 * @param {string} out  folder to write into
 * @returns {string} the MP4's path
 */
export async function compose({ shots, caps }, out) {
	const art = join(out, 'art');
	mkdirSync(art, { recursive: true });
	const D = duration(shots, TAIL);
	const spans = captionSpans(caps, D);
	writeFileSync(join(out, 'frames.txt'), concatList(shots, TAIL));

	const browser = await chromium.launch();
	try {
		const tab = await browser.newPage({ viewport: { width: S, height: S } });
		const draw = async (name, html, clip) => {
			await tab.setContent(html);
			await tab.evaluate(() => document.fonts.ready);
			await tab.screenshot({ path: join(art, name), omitBackground: true, ...(clip ? { clip } : {}) });
		};
		await draw(
			'bg.png',
			page(
				`<div style="position:absolute;left:${APP.x - 1}px;top:${APP.y - 1}px;width:${APP.w}px;height:${APP.h}px;border:1px solid rgba(255,255,255,.14);border-radius:${R + 1}px;box-shadow:0 30px 80px rgba(0,0,0,.6)"></div>
				<div style="position:absolute;left:0;right:0;top:${APP.y + APP.h + 46}px;text-align:center;font-size:26px;color:rgba(255,255,255,.55)">
				<span style="color:#fff;font-weight:700">SG OnSet</span>&nbsp;&nbsp;·&nbsp;&nbsp;<span style="color:#6ea8ff;font-weight:600">sg-onset.vercel.app</span></div>`,
				BACKDROP
			)
		);
		await draw('mask.png', page(`<div style="width:${APP.w}px;height:${APP.h}px;background:#fff;border-radius:${R}px"></div>`, '#000'), {
			x: 0,
			y: 0,
			width: APP.w,
			height: APP.h
		});
		await draw(
			'title.png',
			card(`${NAME}
			<div style="font-size:38px;line-height:1.4;color:rgba(255,255,255,.78)">On-set VFX data, offline first.<br>Syncs to Flow Production Tracking.</div>
			<div style="margin-top:18px;font-size:26px;color:rgba(255,255,255,.5)">iPad · phone · web</div>`)
		);
		await draw(
			'end.png',
			card(`${NAME}
			<div style="font-size:38px;color:rgba(255,255,255,.78)">Free, open source, MIT. Alpha.</div>
			<div style="margin-top:18px;font-size:40px;font-weight:700;color:#6ea8ff">sg-onset.vercel.app</div>
			<div style="font-size:26px;color:rgba(255,255,255,.5)">github.com/ksallee/sg-onset</div>`)
		);
		for (const s of spans) {
			await draw(
				`cap${s.index}.png`,
				page(`<div style="height:${APP.y}px;display:flex;align-items:center;justify-content:center;padding-top:6px;box-sizing:border-box;font-size:48px;font-weight:700;letter-spacing:-.5px">${s.text}</div>`),
				{ x: 0, y: 0, width: S, height: APP.y }
			);
		}
	} finally {
		await browser.close();
	}

	const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(out, 'frames.txt')];
	const still = (file, t) => args.push('-loop', '1', '-framerate', '30', '-t', String(t), '-i', join(art, file));
	still('bg.png', D);
	still('mask.png', D);
	still('title.png', TITLE);
	still('end.png', END);
	for (const s of spans) still(`cap${s.index}.png`, D);
	const mp4 = join(out, 'sg-onset-demo.mp4');
	const graph = filterGraph({ spans, duration: D, title: TITLE, end: END, xfade: XFADE }).join(';');
	args.push('-filter_complex', graph, '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
	execFileSync('ffmpeg', args, { stdio: 'inherit' });
	return mp4;
}
