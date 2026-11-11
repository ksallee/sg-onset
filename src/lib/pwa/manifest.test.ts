// The install identity: the web app manifest, the icons and launch images, and what app.html
// links. Every file named exists at its stated size; the masked icons keep to the safe zone.
// scripts/icons.mjs writes the images from static/brand/icon.svg (docs/design/icon.md).
import { describe, expect, it } from 'vitest';
import manifestText from '../../../static/manifest.webmanifest?raw';
import favicon from '../../../static/favicon.svg?raw';
import html from '../../app.html?raw';
import { parseColor } from '../theme/contrast';
import { token, valueOf } from '../theme/palette';

const manifest = JSON.parse(manifestText);
// Every PNG under static, as a data URL, by its served path.
const pngs = Object.fromEntries(
	Object.entries(import.meta.glob<string>('/static/**/*.png', { query: '?inline', import: 'default', eager: true })).map(([k, v]) => [
		k.replace('/static', ''),
		v
	])
);
// Every SVG under static/brand, as text, by its served path.
const brand = Object.fromEntries(
	Object.entries(import.meta.glob<string>('/static/brand/*.svg', { query: '?raw', import: 'default', eager: true })).map(([k, v]) => [
		k.replace('/static', ''),
		v
	])
);

function pngBytes(path: string): Uint8Array {
	const data = pngs[path];
	expect(data, `${path} is missing`).toBeDefined();
	const bytes = Uint8Array.from(atob(data.split(',')[1]), (c) => c.charCodeAt(0));
	expect(String.fromCharCode(...bytes.subarray(1, 4))).toBe('PNG');
	return bytes;
}

/** Width and height from the IHDR chunk of the PNG served at `path`. */
function pngSize(path: string): [number, number] {
	const bytes = pngBytes(path);
	const view = new DataView(bytes.buffer);
	return [view.getUint32(16), view.getUint32(20)];
}

/** The pixels of a square 8-bit RGB or RGBA PNG. */
async function pngPixels(path: string): Promise<{ size: number; at: (x: number, y: number) => [number, number, number, number] }> {
	const bytes = pngBytes(path);
	const view = new DataView(bytes.buffer);
	const [width, height] = [view.getUint32(16), view.getUint32(20)];
	const [depth, type] = [bytes[24], bytes[25]];
	expect([depth, bytes[28]], `${path}: 8 bit, not interlaced`).toEqual([8, 0]);
	expect([2, 6], `${path}: RGB or RGBA`).toContain(type);
	const bpp = type === 6 ? 4 : 3;
	const idat: BlobPart[] = [];
	for (let p = 8; p < bytes.length; ) {
		const length = view.getUint32(p);
		if (String.fromCharCode(...bytes.subarray(p + 4, p + 8)) === 'IDAT') idat.push(bytes.slice(p + 8, p + 8 + length));
		p += 12 + length;
	}
	// IDAT is a zlib stream: each row a filter byte, then the filtered bytes.
	const inflated = new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'));
	const raw = new Uint8Array(await new Response(inflated).arrayBuffer());
	const stride = width * bpp;
	const out = new Uint8Array(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		for (let i = 0; i < stride; i++) {
			const x = raw[y * (stride + 1) + 1 + i];
			const a = i >= bpp ? out[y * stride + i - bpp] : 0;
			const b = y > 0 ? out[(y - 1) * stride + i] : 0;
			const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0;
			const pa = Math.abs(b - c);
			const pb = Math.abs(a - c);
			const pc = Math.abs(a + b - 2 * c);
			const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			out[y * stride + i] = (x + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
		}
	}
	expect(width).toBe(height);
	return {
		size: width,
		at: (x, y) => {
			const i = y * stride + x * bpp;
			return [out[i], out[i + 1], out[i + 2], bpp === 4 ? out[i + 3] : 255];
		}
	};
}

/** A palette token in a scheme, as #rrggbb. */
function hex(name: string, scheme: 'light' | 'dark'): string {
	const { r, g, b } = parseColor(valueOf(token(name), scheme));
	return '#' + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

type Icon = { src: string; sizes: string; type: string; purpose?: string };

describe('manifest.webmanifest', () => {
	it('has what an installable standalone app needs', () => {
		expect(manifest.id).toBe('/');
		expect(manifest.name).toBe('SG OnSet');
		expect(manifest.short_name).toBe('SG OnSet');
		expect(manifest.description).toMatch(/^On-set VFX data capture/);
		expect(manifest.display).toBe('standalone');
		expect(manifest.start_url).toBe('/');
		expect(manifest.scope).toBe('/');
		// iPad first: either way up.
		expect(manifest.orientation).toBe('any');
		expect(manifest.categories).toContain('productivity');
	});

	it('takes its colours from the dark canvas of the palette', () => {
		expect(manifest.background_color).toBe(hex('bg', 'dark'));
		expect(manifest.theme_color).toBe(hex('bg', 'dark'));
	});

	it('lists 192 and 512 icons, a maskable and a monochrome 512, each a PNG of its size', () => {
		const icons: Icon[] = manifest.icons;
		const has = (sizes: string, purpose: string) => icons.some((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose);
		expect(has('192x192', 'any')).toBe(true);
		expect(has('512x512', 'any')).toBe(true);
		expect(has('512x512', 'maskable')).toBe(true);
		expect(has('512x512', 'monochrome')).toBe(true);
		for (const icon of icons) {
			expect(icon.type).toBe('image/png');
			const [w, h] = icon.sizes.split('x').map(Number);
			expect(pngSize(icon.src)).toEqual([w, h]);
		}
	});

	it('has shortcuts to Shoot and Slates, each with an icon that exists', () => {
		const shortcuts: { name: string; url: string; icons: Icon[] }[] = manifest.shortcuts;
		expect(shortcuts.map((s) => [s.name, s.url])).toEqual([
			['Shoot', '/shoot'],
			['Slates', '/slates']
		]);
		for (const s of shortcuts) {
			for (const icon of s.icons) expect(pngSize(icon.src)).toEqual(icon.sizes.split('x').map(Number));
		}
	});
});

// The icon's two golds as pixels: the bright quarters, and the deep ones (darker, still warm).
const isGold = (r: number, g: number, b: number) => r > 200 && g > 150 && b < 120;
const isDeepGold = (r: number, g: number, b: number) => r > 70 && r < 130 && r > g + 10 && g > b + 25;

describe('the drawing', () => {
	it('is the tracking marker: gold top left and bottom right, deep gold between, on the dark field', async () => {
		const { size, at } = await pngPixels('/icons/apple-touch-icon.png');
		const q = (fx: number, fy: number) => at(Math.round(size * fx), Math.round(size * fy)).slice(0, 3) as [number, number, number];
		expect(isGold(...q(0.37, 0.37)), 'top left').toBe(true);
		expect(isGold(...q(0.63, 0.63)), 'bottom right').toBe(true);
		expect(isDeepGold(...q(0.63, 0.37)), 'top right').toBe(true);
		expect(isDeepGold(...q(0.37, 0.63)), 'bottom left').toBe(true);
		expect(Math.max(...q(0.1, 0.5)), 'the field beside the marker').toBeLessThan(48);
	});

	it('keeps the UI blue and Record red out of the source', () => {
		const fills = [...brand['/brand/icon.svg'].matchAll(/#[0-9a-f]{6}/g)].map((m) => parseColor(m[0]));
		expect(fills.length).toBeGreaterThan(3);
		// Field greys and golds only: red is never under green, blue never over green.
		for (const { r, g, b } of fills) {
			expect(b).toBeLessThanOrEqual(g + 0.02);
			expect(r - g).toBeLessThan(0.25);
		}
	});
});

describe('the masked icons', () => {
	// A platform may cut a maskable icon to any shape inside the circle of radius 40 % of the
	// side (W3C manifest, "icon masks and safe zone"). Nothing of the mark may sit outside it.
	const outside = (size: number, x: number, y: number) => Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4;
	const src = (purpose: string) => (manifest.icons as Icon[]).find((i) => i.purpose === purpose)!.src;

	it('the maskable icon is opaque, with only the field outside the safe zone', async () => {
		const { size, at } = await pngPixels(src('maskable'));
		for (const [x, y] of [
			[0, 0],
			[size - 1, 0],
			[0, size - 1],
			[size - 1, size - 1]
		]) {
			const [r, g, b, a] = at(x, y);
			expect(a, `corner ${x},${y} is opaque`).toBe(255);
			expect(Math.max(r, g, b), `corner ${x},${y} is the dark field`).toBeLessThan(48);
		}
		let stray = 0;
		let ink = 0;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const [r, g, b] = at(x, y);
				if (outside(size, x, y)) stray += Math.max(r, g, b) >= 48 ? 1 : 0;
				else ink += isGold(r, g, b) ? 1 : 0;
			}
		}
		expect(stray, 'pixels of the mark outside the safe zone').toBe(0);
		expect(ink, 'pixels of the mark inside it').toBeGreaterThan(size * size * 0.05);
	});

	it('the monochrome icon is the mark alone, on nothing, inside the safe zone', async () => {
		const { size, at } = await pngPixels(src('monochrome'));
		let stray = 0;
		let ink = 0;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const a = at(x, y)[3];
				if (outside(size, x, y)) stray += a > 0 ? 1 : 0;
				else ink += a === 255 ? 1 : 0;
			}
		}
		expect(at(0, 0)[3]).toBe(0);
		expect(stray).toBe(0);
		expect(ink).toBeGreaterThan(size * size * 0.05);
	});
});

describe('app.html', () => {
	const links = [...html.matchAll(/<link rel="([^"]+)"([^>]*)href="%sveltekit\.assets%([^"]+)"/g)].map((m) => ({
		rel: m[1],
		attrs: m[2],
		href: m[3]
	}));
	const rel = (name: string) => links.filter((l) => l.rel === name);

	it('links the manifest', () => {
		expect(rel('manifest').map((l) => l.href)).toEqual(['/manifest.webmanifest']);
	});

	it('links apple-touch-icons of 180, 167 and 152, each a PNG of its size', () => {
		const icons = rel('apple-touch-icon');
		expect(icons.map((l) => l.attrs.match(/sizes="(\d+)x\1"/)?.[1])).toEqual(['180', '167', '152']);
		for (const l of icons) {
			const size = Number(l.attrs.match(/sizes="(\d+)x/)![1]);
			expect(pngSize(l.href)).toEqual([size, size]);
		}
	});

	it('links an SVG tab icon that follows the scheme, and a 32 px PNG', () => {
		expect(rel('icon').map((l) => l.href)).toEqual(['/favicon.svg', '/favicon-32.png']);
		expect(favicon).toContain('prefers-color-scheme:dark');
		expect(pngSize('/favicon-32.png')).toEqual([32, 32]);
	});

	it('links a launch image for each iPad, both ways up, light and dark, each of its size', () => {
		const images = rel('apple-touch-startup-image');
		const seen = new Map<string, number>();
		for (const l of images) {
			const m = l.attrs.match(
				/media="screen and \(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: 2\) and \(orientation: (portrait|landscape)\) and \(prefers-color-scheme: (light|dark)\)"/
			);
			expect(m, l.href).not.toBeNull();
			const [w, h] = [Number(m![1]), Number(m![2])];
			expect(w).toBeLessThan(h);
			expect(l.href).toBe(`/splash/ipad-${w}x${h}-${m![3]}-${m![4]}.png`);
			expect(pngSize(l.href)).toEqual(m![3] === 'portrait' ? [w * 2, h * 2] : [h * 2, w * 2]);
			seen.set(`${w}x${h}`, (seen.get(`${w}x${h}`) ?? 0) + 1);
		}
		// The 13 and 11 inch Pros, the Air, the iPad and the mini at least; four images each.
		for (const device of ['1032x1376', '1024x1366', '834x1210', '820x1180', '744x1133']) expect(seen.get(device), device).toBe(4);
		expect([...seen.values()].every((n) => n === 4)).toBe(true);
		// No launch image on disk that nothing links.
		expect(Object.keys(pngs).filter((p) => p.startsWith('/splash/')).length).toBe(images.length);
	});

	it('sets the theme colour to the canvas of each scheme', () => {
		const metas = [...html.matchAll(/<meta name="theme-color" media="\(prefers-color-scheme: (light|dark)\)" content="([^"]+)"/g)];
		expect(metas.map((m) => [m[1], m[2]])).toEqual([
			['light', hex('bg', 'light')],
			['dark', hex('bg', 'dark')]
		]);
	});

	it('runs full screen under the status bar on iOS, named SG OnSet', () => {
		expect(html).toContain('viewport-fit=cover');
		expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
		expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
		expect(html).toContain('name="apple-mobile-web-app-title" content="SG OnSet"');
	});
});

describe('static/brand', () => {
	it('holds the source icon, and the mark and lockup for a light and a dark ground', () => {
		expect(Object.keys(brand).sort()).toEqual([
			'/brand/icon.svg',
			'/brand/lockup-dark.svg',
			'/brand/lockup-light.svg',
			'/brand/mark-dark.svg',
			'/brand/mark-light.svg'
		]);
		expect(brand['/brand/icon.svg']).toContain('viewBox="0 0 1024 1024"');
		for (const name of ['light', 'dark']) expect(brand[`/brand/lockup-${name}.svg`]).toContain('>SG OnSet</text>');
	});
});
