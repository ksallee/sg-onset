import { describe, expect, it } from 'vitest';
import { apca, composite, flatten, inGamut, luminance, oklchToSrgb, parseColor, wcag } from './contrast';

describe('parseColor', () => {
	it('reads hex, rgb and oklch, with alpha', () => {
		expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
		expect(parseColor('#00000080').a).toBeCloseTo(0.502, 2);
		expect(parseColor('rgb(255 0 0 / 0.5)')).toEqual({ r: 1, g: 0, b: 0, a: 0.5 });
		const red = parseColor('oklch(0.628 0.2577 29.23)');
		expect(red.r).toBeCloseTo(1, 2);
		expect(red.g).toBeCloseTo(0, 2);
		expect(red.b).toBeCloseTo(0, 2);
		expect(parseColor('oklch(62.8% 0.2577 29.23 / 0.4)').a).toBe(0.4);
	});
	it('refuses what it cannot read', () => {
		expect(() => parseColor('papayawhip')).toThrow();
	});
});

describe('oklchToSrgb and inGamut', () => {
	it('maps white and black', () => {
		const w = oklchToSrgb(1, 0, 0);
		expect(w.r).toBeCloseTo(1, 3);
		expect(w.b).toBeCloseTo(1, 3);
		expect(oklchToSrgb(0, 0, 0).g).toBeCloseTo(0, 6);
	});
	it('flags a colour outside sRGB', () => {
		expect(inGamut(oklchToSrgb(0.7, 0.1, 250))).toBe(true);
		expect(inGamut(oklchToSrgb(0.7, 0.35, 150))).toBe(false);
	});
});

describe('composite and flatten', () => {
	it('lays a translucent colour over an opaque one', () => {
		const c = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 1, g: 1, b: 1 });
		expect(c.r).toBeCloseTo(0.5, 6);
	});
	it('flattens a stack from the bottom up', () => {
		const c = flatten(['#ffffff', 'rgb(0 0 0 / 0.5)', 'rgb(0 0 0 / 0.5)']);
		expect(c.r).toBeCloseTo(0.25, 6);
	});
	it('needs an opaque bottom layer', () => {
		expect(() => flatten(['rgb(0 0 0 / 0.5)'])).toThrow();
	});
});

describe('WCAG 2', () => {
	it('gives the known ratios', () => {
		expect(luminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 6);
		expect(wcag('#000', '#fff')).toBeCloseTo(21, 6);
		expect(wcag('#fff', '#000')).toBeCloseTo(21, 6);
		expect(wcag('#777', '#fff')).toBeCloseTo(4.48, 2);
	});
	it('composites translucent text over its background', () => {
		expect(wcag('rgb(0 0 0 / 0.5)', '#fff')).toBeCloseTo(wcag('#808080', '#fff'), 1);
	});
});

describe('APCA (W3 0.0.98G-4g)', () => {
	it('matches the reference values', () => {
		expect(apca('#888', '#fff')).toBeCloseTo(63.06, 1);
		expect(apca('#fff', '#888')).toBeCloseTo(-68.54, 1);
		expect(apca('#000', '#fff')).toBeCloseTo(106.04, 1);
		expect(apca('#fff', '#000')).toBeCloseTo(-107.88, 1);
	});
	it('gives 0 for near-identical colours', () => {
		expect(apca('#777', '#777')).toBe(0);
	});
});
