import { describe, expect, it } from 'vitest';
import { expiring, partMargin, planParts } from './upload';

describe('planParts', () => {
	it('is one part when the transport names no part size', () => {
		expect(planParts(1000)).toEqual([{ index: 0, start: 0, end: 1000 }]);
	});

	it('cuts the file into parts, the last one shorter', () => {
		expect(planParts(25, 10)).toEqual([
			{ index: 0, start: 0, end: 10 },
			{ index: 1, start: 10, end: 20 },
			{ index: 2, start: 20, end: 25 }
		]);
	});

	it('has no short tail when the size divides evenly', () => {
		expect(planParts(20, 10)).toHaveLength(2);
	});

	it('is one part for a file smaller than a part, or for a bad part size', () => {
		expect(planParts(5, 10)).toEqual([{ index: 0, start: 0, end: 5 }]);
		expect(planParts(5, 0)).toEqual([{ index: 0, start: 0, end: 5 }]);
	});

	it('is one empty part for an empty file', () => {
		expect(planParts(0, 10)).toEqual([{ index: 0, start: 0, end: 0 }]);
	});
});

describe('partMargin', () => {
	it('is the policy margin on a fast network', () => {
		expect(partMargin(60_000, 0)).toBe(60_000);
		expect(partMargin(60_000, 30_000)).toBe(60_000);
	});

	it('grows to one and a half times the last part on a slow one', () => {
		expect(partMargin(60_000, 300_000)).toBe(450_000);
	});
});

describe('expiring', () => {
	it('is true once less than the margin is left', () => {
		expect(expiring(840_000, 700_000, 60_000)).toBe(false);
		expect(expiring(840_000, 780_000, 60_000)).toBe(false);
		expect(expiring(840_000, 780_001, 60_000)).toBe(true);
		expect(expiring(840_000, 900_000, 60_000)).toBe(true);
	});

	it('is never true for a session that does not expire', () => {
		expect(expiring(undefined, 1e15, 60_000)).toBe(false);
	});
});
