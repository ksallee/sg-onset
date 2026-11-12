// Writes static/og.png, the 1200x630 image a link preview shows: `node scripts/og.mjs`. The mark
// and its colours are from static/brand/icon.svg; the words are the app's own line. Rendered by
// the Chromium that Playwright already installs for `pnpm qa`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = new URL('../', import.meta.url);
const source = readFileSync(new URL('static/brand/icon.svg', ROOT), 'utf8');
const MARK = source.match(/<g id="mark">([\s\S]*?)<\/g>\s*<\/svg>/)[1];
const GOLD = source.match(/\.gold \{ fill: (#[0-9a-f]{6})/)[1];
const DEEP = source.match(/\.deep \{ fill: (#[0-9a-f]{6})/)[1];

const POINTS = ['Slates, takes, cameras, lenses, photos', 'Works with no network', 'Syncs to Flow PT', 'Free and open source'];

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
	* { margin: 0; padding: 0; box-sizing: border-box; }
	body {
		width: 1200px; height: 630px; padding: 76px 84px;
		display: flex; flex-direction: column; justify-content: space-between;
		background: radial-gradient(1200px 700px at 85% 0%, #1c1a14 0%, #0a0a0b 60%);
		color: #eff0f2;
		font-family: ui-sans-serif, system-ui, -apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
	}
	.brand { display: flex; align-items: center; gap: 28px; }
	.brand svg { width: 104px; height: 104px; }
	.gold { fill: ${GOLD}; } .deep { fill: ${DEEP}; }
	.name { font-size: 84px; font-weight: 650; letter-spacing: -2.5px; }
	h1 { font-size: 58px; line-height: 66px; font-weight: 650; letter-spacing: -1.6px; max-width: 980px; }
	ul { list-style: none; display: flex; flex-wrap: wrap; gap: 14px; }
	li { padding: 12px 22px; border-radius: 999px; background: rgba(255,255,255,0.08); font-size: 26px; font-weight: 500; color: #d6d7dc; }
	li:first-child { background: ${GOLD}; color: #17130a; font-weight: 600; }
</style></head><body>
	<div class="brand"><svg viewBox="240 240 544 544">${MARK}</svg><span class="name">SG OnSet</span></div>
	<h1>On-set VFX data capture for Flow Production Tracking.</h1>
	<ul>${POINTS.map((p) => `<li>${p}</li>`).join('')}</ul>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: fileURLToPath(new URL('static/og.png', ROOT)) });
await browser.close();
console.log('static/og.png');
