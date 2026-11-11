import { describe, expect, it } from 'vitest';
import { gearCounts, hasGear } from './summary';

describe('gearCounts', () => {
	it('counts cameras, lenses and setups', () => {
		expect(gearCounts([1, 2], [1, 2, 3], [1])).toEqual({ cameras: 2, lenses: 3, setups: 1 });
	});
	it('knows a project with no gear', () => {
		expect(hasGear(gearCounts([], [], []))).toBe(false);
		expect(hasGear(gearCounts([], [1], []))).toBe(true);
	});
});
