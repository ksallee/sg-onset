// The web app manifest and the icons app.html links: present, complete, the right sizes.
import { describe, expect, it } from 'vitest';
import manifestText from '../../../static/manifest.webmanifest?raw';
import html from '../../app.html?raw';

const manifest = JSON.parse(manifestText);
// Every PNG under static/icons, as a data URL, by its served path.
const pngs = Object.fromEntries(
	Object.entries(import.meta.glob<string>('/static/icons/*.png', { query: '?inline', import: 'default', eager: true })).map(
		([k, v]) => [k.replace('/static', ''), v]
	)
);

/** Width and height from the IHDR chunk of the PNG served at `path`. */
function pngSize(path: string): [number, number] {
	const data = pngs[path];
	expect(data, `${path} is missing`).toBeDefined();
	const bytes = Uint8Array.from(atob(data.split(',')[1]), (c) => c.charCodeAt(0));
	const view = new DataView(bytes.buffer);
	expect(String.fromCharCode(...bytes.subarray(1, 4))).toBe('PNG');
	return [view.getUint32(16), view.getUint32(20)];
}

describe('manifest.webmanifest', () => {
	it('has what an installable standalone app needs', () => {
		expect(manifest.name).toBe('sg-onset');
		expect(manifest.short_name).toBe('sg-onset');
		expect(manifest.display).toBe('standalone');
		expect(manifest.start_url).toBe('/');
		expect(manifest.scope).toBe('/');
		// iPad first: either way up.
		expect(manifest.orientation).toBe('any');
		expect(manifest.background_color).toBe('#000000');
		expect(manifest.theme_color).toBe('#000000');
	});

	it('lists 192 and 512 icons and a maskable 512, each a PNG of its size', () => {
		const icons: { src: string; sizes: string; type: string; purpose?: string }[] = manifest.icons;
		const has = (sizes: string, purpose: string) => icons.some((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose);
		expect(has('192x192', 'any')).toBe(true);
		expect(has('512x512', 'any')).toBe(true);
		expect(has('512x512', 'maskable')).toBe(true);
		for (const icon of icons) {
			expect(icon.type).toBe('image/png');
			const [w, h] = icon.sizes.split('x').map(Number);
			expect(pngSize(icon.src)).toEqual([w, h]);
		}
	});
});

describe('app.html', () => {
	const href = (rel: string) => html.match(new RegExp(`<link rel="${rel}"[^>]*href="%sveltekit\\.assets%([^"]+)"`))?.[1];

	it('links the manifest', () => {
		expect(href('manifest')).toBe('/manifest.webmanifest');
	});

	it('links a 180 apple-touch-icon', () => {
		const icon = href('apple-touch-icon');
		expect(icon).toBeDefined();
		expect(pngSize(icon!)).toEqual([180, 180]);
	});

	it('runs full screen under the status bar on iOS', () => {
		expect(html).toContain('viewport-fit=cover');
		expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
		expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
	});
});
