import { describe, expect, it } from 'vitest';
import { springAtRest, springLinear, springProgress, springSettle, springStep, type Spring } from './spring';

const CRITICAL: Spring = { response: 0.4, damping: 1 };
const BOUNCY: Spring = { response: 0.4, damping: 0.6 };

function run(k: Spring, from: number, to: number, v: number, seconds: number, hz: number) {
	let s = { x: from, v };
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < seconds * hz; i++) {
		s = springStep(s, to, 1 / hz, k);
		min = Math.min(min, s.x);
		max = Math.max(max, s.x);
	}
	return { ...s, min, max };
}

describe('springStep', () => {
	it('settles on the target', () => {
		const s = run(CRITICAL, 0, 100, 0, 1.5, 60);
		expect(s.x).toBeCloseTo(100, 1);
		expect(s.v).toBeCloseTo(0, 0);
	});
	it('a critically damped spring from rest never passes the target', () => {
		expect(run(CRITICAL, 0, 100, 0, 1.5, 120).max).toBeLessThanOrEqual(100);
	});
	it('an underdamped spring passes it, then comes back', () => {
		const s = run(BOUNCY, 0, 100, 0, 2, 120);
		expect(s.max).toBeGreaterThan(101);
		expect(s.x).toBeCloseTo(100, 1);
	});
	it('is the same at 60 Hz and at 120 Hz', () => {
		const a = run(CRITICAL, 0, 100, 0, 0.2, 60);
		const b = run(CRITICAL, 0, 100, 0, 0.2, 120);
		expect(a.x).toBeCloseTo(b.x, 6);
		expect(a.v).toBeCloseTo(b.v, 6);
	});
	it('carries the velocity it is given', () => {
		// Thrown away from the target: it goes on that way first.
		const s = springStep({ x: 0, v: -600 }, 100, 1 / 60, CRITICAL);
		expect(s.x).toBeLessThan(0);
		// Thrown at the target: further along than from rest.
		const thrown = springStep({ x: 0, v: 2000 }, 100, 0.05, CRITICAL);
		const rest = springStep({ x: 0, v: 0 }, 100, 0.05, CRITICAL);
		expect(thrown.x).toBeGreaterThan(rest.x);
	});
	it('a new target mid-flight keeps position and velocity', () => {
		const mid = springStep({ x: 0, v: 0 }, 100, 0.1, CRITICAL);
		const turned = springStep(mid, 0, 0, CRITICAL);
		expect(turned).toEqual(mid);
	});
	it('no time, no move', () => {
		expect(springStep({ x: 3, v: 7 }, 100, 0, CRITICAL)).toEqual({ x: 3, v: 7 });
	});
});

describe('springAtRest', () => {
	it('is true on the target and still, false while moving or away', () => {
		expect(springAtRest({ x: 100.1, v: 1 }, 100)).toBe(true);
		expect(springAtRest({ x: 100.1, v: 80 }, 100)).toBe(false);
		expect(springAtRest({ x: 90, v: 0 }, 100)).toBe(false);
	});
});

describe('springSettle', () => {
	it('grows with the response', () => {
		expect(springSettle({ response: 0.5, damping: 1 })).toBeGreaterThan(springSettle({ response: 0.25, damping: 1 }));
	});
	it('a critically damped spring is within half a percent after about 1.2 responses', () => {
		expect(springSettle(CRITICAL)).toBeGreaterThan(0.4);
		expect(springSettle(CRITICAL)).toBeLessThan(0.52);
	});
});

describe('springLinear', () => {
	it('is a CSS linear() from 0 to 1 with a duration', () => {
		const css = springLinear(CRITICAL);
		expect(css.easing).toMatch(/^linear\(0, [\d., ]+, 1\)$/);
		expect(css.duration).toBe(Math.round((springSettle(CRITICAL) * 1000) / 10) * 10);
	});
	it('rises all the way for a critically damped spring', () => {
		const stops = springLinear(CRITICAL).easing.slice(7, -1).split(', ').map(Number);
		for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1]);
	});
	it('starts fast: most of the way in the first third', () => {
		const stops = springLinear(CRITICAL).easing.slice(7, -1).split(', ').map(Number);
		expect(stops[Math.round(stops.length / 3)]).toBeGreaterThan(0.6);
	});
});

describe('springProgress', () => {
	it('goes from 0 to 1', () => {
		expect(springProgress(CRITICAL, 0)).toBe(0);
		expect(springProgress(CRITICAL, 0.1)).toBeGreaterThan(0.2);
		expect(springProgress(CRITICAL, 2)).toBeCloseTo(1, 5);
	});
});
