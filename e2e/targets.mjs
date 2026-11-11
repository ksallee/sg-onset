// The screens the app is checked on, shared by playwright.config.ts and tools/shots.mjs.
// The iPad in landscape is the primary target. WebKit stands in for iPadOS Safari, Chromium for
// a phone-width window. All three have touch.

/** @typedef {{ name: string; browser: 'webkit' | 'chromium'; width: number; height: number; scale: number; userAgent: string }} Target */

const IPAD_UA =
	'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PHONE_UA =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/** @type {Target[]} */
export const TARGETS = [
	{ name: 'ipad-landscape', browser: 'webkit', width: 1180, height: 820, scale: 2, userAgent: IPAD_UA },
	{ name: 'ipad-portrait', browser: 'webkit', width: 820, height: 1180, scale: 2, userAgent: IPAD_UA },
	{ name: 'phone', browser: 'chromium', width: 390, height: 844, scale: 3, userAgent: PHONE_UA }
];

/** Playwright context options for a target: the meta viewport is honoured, touch is on. */
export function contextFor(/** @type {Target} */ t) {
	return {
		viewport: { width: t.width, height: t.height },
		deviceScaleFactor: t.scale,
		isMobile: true,
		hasTouch: true,
		userAgent: t.userAgent
	};
}

/** A target by name, or an ad hoc `WIDTHxHEIGHT` (WebKit at 2x). */
export function targetFor(/** @type {string} */ name) {
	const known = TARGETS.find((t) => t.name === name);
	if (known) return known;
	const m = /^(\d+)x(\d+)$/.exec(name);
	if (!m) throw new Error(`unknown viewport ${name}: use ${TARGETS.map((t) => t.name).join(', ')} or WIDTHxHEIGHT`);
	return { name, browser: 'webkit', width: Number(m[1]), height: Number(m[2]), scale: 2, userAgent: IPAD_UA };
}
