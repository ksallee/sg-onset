// Writes every icon, launch image and lockup from static/brand/icon.svg: `node scripts/icons.mjs`.
// The drawing is rendered by the Chromium that Playwright already installs for `pnpm qa`, so
// there is nothing new to depend on. It also rewrites the launch image links in src/app.html,
// between the `launch images` comments. docs/design/icon.md explains each file.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ROOT = new URL('../', import.meta.url);
const at = (path) => new URL(path, ROOT);
const source = readFileSync(at('static/brand/icon.svg'), 'utf8');

// The parts of the source: the mark, and the colours it is drawn in.
const MARK = source.match(/<g id="mark">([\s\S]*?)<\/g>\s*<\/svg>/)[1].replace(/\n\t/g, '\n').trim();
const [FIELD_TOP, FIELD_BOTTOM] = [...source.matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
const GOLD = source.match(/\.gold \{ fill: (#[0-9a-f]{6})/)[1];
const DEEP = source.match(/\.deep \{ fill: (#[0-9a-f]{6})/)[1];

// The mark on a ground that is not the icon's own field. The canvas and the label of each scheme
// are from src/lib/theme/palette.ts. The golds are the icon's own (docs/design/icon.md): on a
// light ground the deep quarters go near black and carry the shape (13.7:1 on the canvas); the
// gold beside them is a shade darker than on the field.
const GROUND = {
	light: { bg: '#ecedf2', ink: '#0d0e12', gold: '#cf9b0f', deep: '#272114' },
	dark: { bg: FIELD_BOTTOM, ink: '#eff0f2', gold: GOLD, deep: DEEP }
};

// The mark's own box in the 1024 canvas, and the scale that keeps it inside a maskable icon's
// safe circle with room.
const BOX = { x: 240, y: 240, w: 544, h: 544 };
const MASKABLE_SCALE = 0.84;
/** Where there is one colour only, the deep quarters are that colour at this strength. */
const DEEP_ALPHA = 0.35;
/** The corner radius iOS draws, as a share of the side: for the icons nothing else rounds. */
const CORNER = 0.224;

// iPads on iPadOS 26, in points, portrait. All are 2x.
const IPADS = [
	[1032, 1376], // iPad Pro 13-inch (M4, M5)
	[1024, 1366], // iPad Pro 12.9-inch, iPad Air 13-inch
	[834, 1210], // iPad Pro 11-inch (M4, M5)
	[834, 1194], // iPad Pro 11-inch (1st to 4th), iPad Air 11-inch (M2, M3)
	[820, 1180], // iPad Air (4th, 5th), iPad (10th, A16)
	[744, 1133], // iPad mini (6th, A17 Pro)
	[810, 1080], // iPad (8th, 9th)
	[834, 1112], // iPad Air (3rd)
	[768, 1024] // iPad mini (5th)
];

const fills = (gold, deep) => `.gold{fill:${gold}}.deep{fill:${deep}}`;
const style = (gold, deep) => `<style>${fills(gold, deep)}</style>`;
const field = `<defs><linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FIELD_TOP}"/><stop offset="1" stop-color="${FIELD_BOTTOM}"/></linearGradient></defs>`;
const scaled = (k) => `<g transform="translate(512 512) scale(${k}) translate(-512 -512)">${MARK}</g>`;
const svg = (body, box = '0 0 1024 1024', attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"${attrs}>${body}</svg>`;

/** The icon as iOS wants it: square, full bleed, opaque. The system cuts the corners. */
const full = () => svg(`${field}${style(GOLD, DEEP)}<rect width="1024" height="1024" fill="url(#field)"/>${MARK}`);
/** The icon with its own corners, for places that show the image as it is. */
const rounded = () =>
	svg(`${field}${style(GOLD, DEEP)}<rect width="1024" height="1024" rx="${1024 * CORNER}" fill="url(#field)"/>${MARK}`);
/** Full bleed with the mark drawn smaller, inside the safe circle (40 % of the side). */
const maskable = () => svg(`${field}${style(GOLD, DEEP)}<rect width="1024" height="1024" fill="url(#field)"/>${scaled(MASKABLE_SCALE)}`);
/** The mark alone, white on nothing: only its alpha is used, so the deep quarters are faint. */
const monochrome = () => svg(`<style>.gold{fill:#fff}.deep{fill:#fff;fill-opacity:${DEEP_ALPHA}}</style>${scaled(MASKABLE_SCALE)}`);
/** The mark alone on a ground, cropped to its box. */
const mark = (g) => svg(`<title>SG OnSet</title>${style(g.gold, g.deep)}${MARK}`, `${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`);

/**
 * The mark drawn again on a pixel grid, where the 1024 drawing would blur: the same square, from
 * `a` to `b` in whole pixels with the centre on a pixel edge, outer corners of radius `r`.
 */
function fitted(a, b, r) {
	const c = (a + b) / 2;
	return (
		`<rect class="deep" x="${a}" y="${a}" width="${b - a}" height="${b - a}" rx="${r}"/>` +
		`<path class="gold" d="M${a + r} ${a}H${c}V${c}H${a}V${a + r}A${r} ${r} 0 0 1 ${a + r} ${a}Z"/>` +
		`<path class="gold" d="M${c} ${c}H${b}V${b - r}A${r} ${r} 0 0 1 ${b - r} ${b}H${c}Z"/>`
	);
}

/** The tab icon: the 16 px drawing with no field, in the golds of a light tab or of a dark one. */
const favicon = () =>
	svg(
		`<title>SG OnSet</title><style>${fills(GROUND.light.gold, GROUND.light.deep)}@media (prefers-color-scheme:dark){${fills(GROUND.dark.gold, GROUND.dark.deep)}}</style>` +
			fitted(1, 15, 2),
		'0 0 16 16'
	);
/** The 32 px fallback: the field with its corners, and the 32 px drawing. */
const favicon32 = () =>
	svg(`${field}${style(GOLD, DEEP)}<rect width="32" height="32" rx="7.2" fill="url(#field)"/>` + fitted(7, 25, 2), '0 0 32 32');

// The name beside the mark, in the system face. `width` is measured in Chromium below.
const FONT = `ui-sans-serif, system-ui, -apple-system, 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif`;
const WORD = { size: 60, weight: 650, tracking: -1.5, markH: 64, gap: 22, h: 96 };
const wordText = (g, x) =>
	`<text x="${x}" y="${WORD.h / 2 + WORD.size * 0.355}" font-family="${FONT}" font-size="${WORD.size}" font-weight="${WORD.weight}" letter-spacing="${WORD.tracking}" fill="${g.ink}">SG OnSet</text>`;
function lockup(g, textWidth) {
	const k = WORD.markH / BOX.h;
	const markW = BOX.w * k;
	const x = Math.round(markW + WORD.gap);
	const w = Math.ceil(x + textWidth + 2);
	return svg(
		`<title>SG OnSet</title>${style(g.gold, g.deep)}` +
			`<g transform="translate(0 ${(WORD.h - WORD.markH) / 2}) scale(${k.toFixed(5)}) translate(${-BOX.x} ${-BOX.y})">${MARK}</g>${wordText(g, x)}`,
		`0 0 ${w} ${WORD.h}`,
		` width="${w}" height="${WORD.h}" role="img"`
	);
}

const browser = await chromium.launch();

/** Render `markup` (an SVG) to a PNG of `w` by `h` device pixels at `scale`. */
async function png(path, markup, w, h, { scale = 1, background = 'transparent', inner = '' } = {}) {
	const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
	const page = await context.newPage();
	await page.setContent(
		`<style>html,body{margin:0;height:100%;background:${background}}body{display:grid;place-items:center}svg{display:block;${inner || 'width:100vw;height:100vh'}}</style>${markup}`
	);
	writeFileSync(at(path), await page.screenshot({ omitBackground: background === 'transparent' }));
	await context.close();
}

async function measureWord() {
	const page = await browser.newPage();
	await page.setContent(svg(wordText(GROUND.light, 0), '0 0 600 96', ' width="600" height="96"'));
	const width = await page.evaluate(() => document.querySelector('text').getComputedTextLength());
	await page.close();
	return width;
}

for (const dir of ['static/icons', 'static/splash']) {
	rmSync(at(dir), { recursive: true, force: true });
	mkdirSync(at(dir), { recursive: true });
}

// Home Screen and manifest icons.
for (const size of [180, 167, 152]) await png(`static/icons/apple-touch-icon${size === 180 ? '' : `-${size}`}.png`, full(), size, size, { background: FIELD_BOTTOM });
for (const size of [192, 512]) await png(`static/icons/icon-${size}.png`, rounded(), size, size);
await png('static/icons/icon-maskable-512.png', maskable(), 512, 512, { background: FIELD_BOTTOM });
await png('static/icons/icon-monochrome-512.png', monochrome(), 512, 512);

// The tab icon.
writeFileSync(at('static/favicon.svg'), favicon() + '\n');
await png('static/favicon-32.png', favicon32(), 32, 32);

// The mark and the lockup, for a light and for a dark ground.
const textWidth = await measureWord();
for (const [name, g] of Object.entries(GROUND)) {
	writeFileSync(at(`static/brand/mark-${name}.svg`), mark(g) + '\n');
	writeFileSync(at(`static/brand/lockup-${name}.svg`), lockup(g, textWidth) + '\n');
}

// Launch images: the mark, 112 pt wide, centred on the scheme's canvas, for each iPad both ways up.
const links = [];
for (const [w, h] of IPADS) {
	for (const orientation of ['portrait', 'landscape']) {
		const [vw, vh] = orientation === 'portrait' ? [w, h] : [h, w];
		for (const [name, g] of Object.entries(GROUND)) {
			const file = `splash/ipad-${w}x${h}-${orientation}-${name}.png`;
			await png(`static/${file}`, mark(g), vw, vh, { scale: 2, background: g.bg, inner: 'width:112px;height:auto' });
			links.push(
				`\t\t<link rel="apple-touch-startup-image" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: 2) and (orientation: ${orientation}) and (prefers-color-scheme: ${name})" href="%sveltekit.assets%/${file}" />`
			);
		}
	}
}
await browser.close();

// The links in src/app.html, between the two comments.
const htmlUrl = at('src/app.html');
const html = readFileSync(htmlUrl, 'utf8');
const block = /(<!-- launch images: written by scripts\/icons\.mjs -->\n)[\s\S]*?(\t\t<!-- \/launch images -->)/;
if (!block.test(html)) throw new Error('src/app.html has no launch images block');
writeFileSync(htmlUrl, html.replace(block, `$1${links.join('\n')}\n$2`));

console.log(`Wrote static/icons, static/splash (${links.length}), static/brand, static/favicon.* and the links in src/app.html`);
