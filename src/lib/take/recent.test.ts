import { describe, expect, it } from 'vitest';
import { pushRecent } from './recent';

describe('pushRecent', () => {
	it('puts the newest first', () => {
		expect(pushRecent([2.8, 4], 5.6)).toEqual([5.6, 2.8, 4]);
	});
	it('moves a repeat to the front, once', () => {
		expect(pushRecent([2.8, 4, 5.6], 4)).toEqual([4, 2.8, 5.6]);
	});
	it('keeps the cap', () => {
		expect(pushRecent([1, 2, 3, 4, 5], 6)).toEqual([6, 1, 2, 3, 4]);
		expect(pushRecent([1, 2, 3], 4, 2)).toEqual([4, 1]);
	});
	it('does not change the list given', () => {
		const list = [1, 2];
		pushRecent(list, 3);
		expect(list).toEqual([1, 2]);
	});
	it('holds zero once, never as a negative zero', () => {
		expect(pushRecent([0, 2], -0)).toEqual([0, 2]);
		expect(Object.is(pushRecent([2], -0)[0], 0)).toBe(true);
	});
	it('keeps nothing that is not a number', () => {
		expect(pushRecent([1, 2], Number.NaN)).toEqual([1, 2]);
		expect(pushRecent([1, 2], Number.POSITIVE_INFINITY)).toEqual([1, 2]);
	});
	it('holds nothing at a cap of zero', () => {
		expect(pushRecent([1, 2], 3, 0)).toEqual([]);
	});
});
