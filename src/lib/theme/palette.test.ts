import { describe, expect, it } from 'vitest';
import { measure, report, layers } from './check';
import { oklchToSrgb, inGamut } from './contrast';
import { renderCompatCss, renderCss } from './css';
import { MODES, PAIRINGS, SCHEMES, TOKENS, valueOf } from './palette';

// Node's fs, without @types/node (the project has none): the test runs in node.
const fs: { readFileSync(path: URL, encoding: 'utf8'): string } = await import(/* @vite-ignore */ `node:${'fs'}`);

// The names the kit and the shadcn mapping in src/app.css already read: switching over must be
// an import, so every one of them is here.
const KIT_NAMES = [
	'bg', 'bg-elevated', 'cell', 'cell-elevated', 'label', 'label-2', 'label-3', 'separator', 'fill', 'fill-2',
	'fill-3', 'press', 'tint', 'on-tint', 'destructive', 'mat-bar', 'thumb', 'segment-thumb', 'scrim', 'record',
	'on-record', 'changed'
];

describe('the tokens', () => {
	it('keep every name the kit uses', () => {
		const names = TOKENS.map((t) => t.name);
		for (const k of KIT_NAMES) expect(names).toContain(k);
	});
	it('have unique names', () => {
		const names = TOKENS.map((t) => t.name);
		expect(new Set(names).size).toBe(names.length);
	});
	it('stay inside sRGB in every scheme', () => {
		for (const t of TOKENS.filter((x) => !x.raw))
			for (const s of SCHEMES) {
				const v = valueOf(t, s);
				const mt = v.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)/);
				expect(mt, `${t.name} in ${s}: ${v}`).not.toBeNull();
				const [l, c, h] = mt!.slice(1).map(Number);
				expect(inGamut(oklchToSrgb(l, c, h)), `--${t.name} in ${s} is out of sRGB`).toBe(true);
			}
	});
	it('light night only with the red channel', () => {
		for (const t of TOKENS.filter((x) => !x.raw))
			for (const s of ['night', 'night-more'] as const) {
				const [l, c, h] = valueOf(t, s).match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)/)!.slice(1).map(Number);
				const rgb = oklchToSrgb(l, c, h);
				expect(Math.max(rgb.g, rgb.b), `--${t.name} in ${s} lights green or blue`).toBeLessThan(0.004);
			}
	});
});

describe('every pairing meets its target', () => {
	for (const s of SCHEMES)
		it(s, () => {
			const failures = report(s).filter((r) => !r.pass);
			expect(failures.map((f) => `--${f.fg} on ${f.on}: ${f.wcag.toFixed(2)}:1, Lc ${f.apca.toFixed(1)} < ${f.min.wcag}:1, Lc ${f.min.apca}`)).toEqual([]);
		});
	it('covers every mode', () => {
		for (const mode of MODES) expect(report(mode).length).toBeGreaterThan(PAIRINGS.length);
	});
});

describe('check', () => {
	it('stacks translucent layers over the surface', () => {
		expect(layers('cell>tint-fill', 'light')).toHaveLength(2);
		expect(layers('cell>good@status-fill', 'light')[1]).toMatch(/\/ 0\.12\)$/);
	});
	it('measures black on white as 21:1', () => {
		const r = measure('label', 'cell', 'light-more');
		expect(r.wcag).toBeCloseTo(21, 1);
		expect(r.apca).toBeCloseTo(106, 0);
	});
});

describe('tokens.css', () => {
	it('is generated from palette.ts (run `node scripts/theme-tokens.mjs` after an edit)', () => {
		const file = fs.readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
		expect(file).toBe(renderCss());
	});
	it('keys on data-theme, data-night and the system settings', () => {
		const css = renderCss();
		for (const s of ["[data-theme='light']", "[data-theme='dark']", "[data-night='true']", 'prefers-color-scheme: dark', 'prefers-contrast: more', "[data-contrast='more']", 'prefers-reduced-transparency: reduce'])
			expect(css).toContain(s);
	});
});

describe('compat.css', () => {
	it('is generated from palette.ts too', () => {
		const file = fs.readFileSync(new URL('./compat.css', import.meta.url), 'utf8');
		expect(file).toBe(renderCompatCss());
	});
	it('puts each old kit theme class on the scheme it stands for, night last', () => {
		const css = renderCompatCss();
		const at = (s: string) => css.indexOf(s);
		for (const s of [':where(.ios-light)', ':where(.ios-dark)', ':where(.ios-night)']) expect(css).toContain(s);
		expect(at(':where(.ios-dark)')).toBeLessThan(at(':where(.ios-night)'));
		expect(css).toContain('--label: oklch(0.61 0.2503 29.234)');
	});
});
