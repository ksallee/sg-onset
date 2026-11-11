import { describe, expect, it } from 'vitest';
import { dimProgress, project, releaseVelocity, rubberband } from './gesture';

describe('rubberband', () => {
	it('follows less the further it is pulled', () => {
		const a = rubberband(50, 800);
		const b = rubberband(100, 800);
		const c = rubberband(400, 800);
		expect(a).toBeGreaterThan(0);
		expect(a).toBeLessThan(50);
		expect(b - a).toBeLessThan(a);
		expect(c).toBeLessThan(400 * 0.55);
	});
	it('never passes the dimension, keeps the sign, and is 0 at 0', () => {
		expect(rubberband(1e6, 800)).toBeLessThan(800);
		expect(rubberband(-100, 800)).toBeCloseTo(-rubberband(100, 800), 9);
		expect(rubberband(0, 800)).toBe(0);
	});
});

describe('project', () => {
	it('throws a flick forward, the way it was going', () => {
		expect(project(1000)).toBeCloseTo(499, 0);
		expect(project(-1000)).toBeCloseTo(-499, 0);
		expect(project(0)).toBe(0);
	});
	it('a quicker stop goes less far', () => {
		expect(project(1000, 0.99)).toBeLessThan(project(1000));
	});
});

describe('releaseVelocity', () => {
	it('is the speed over the last samples, px per second', () => {
		const samples = [
			{ p: 0, t: 0 },
			{ p: 10, t: 16 },
			{ p: 30, t: 32 },
			{ p: 60, t: 48 }
		];
		expect(releaseVelocity(samples, 48)).toBeCloseTo(1250, 0);
	});
	it('forgets what is older than the window', () => {
		const samples = [
			{ p: 0, t: 0 },
			{ p: 500, t: 100 },
			{ p: 510, t: 150 },
			{ p: 520, t: 200 }
		];
		expect(releaseVelocity(samples, 200)).toBeCloseTo(200, 0);
	});
	it('a finger that stopped before lifting has none', () => {
		const samples = [
			{ p: 0, t: 0 },
			{ p: 100, t: 20 }
		];
		expect(releaseVelocity(samples, 300)).toBe(0);
	});
	it('one sample or none: 0', () => {
		expect(releaseVelocity([], 0)).toBe(0);
		expect(releaseVelocity([{ p: 5, t: 5 }], 5)).toBe(0);
	});
});

describe('dimProgress', () => {
	it('is full at and above the lowest detent, and goes with the sheet below it', () => {
		expect(dimProgress(0, 400, 800)).toBe(1);
		expect(dimProgress(400, 400, 800)).toBe(1);
		expect(dimProgress(600, 400, 800)).toBe(0.5);
		expect(dimProgress(800, 400, 800)).toBe(0);
		expect(dimProgress(900, 400, 800)).toBe(0);
	});
	it('with no room to travel it is full', () => {
		expect(dimProgress(10, 400, 400)).toBe(1);
	});
});
