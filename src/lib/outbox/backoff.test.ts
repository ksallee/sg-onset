import { describe, expect, it } from 'vitest';
import { backoffMs, exhausted } from './backoff';

const policy = { baseMs: 2000, factor: 2, maxMs: 60_000, maxAttempts: 4 };

describe('backoffMs', () => {
	it('doubles from the base with each attempt', () => {
		expect([1, 2, 3, 4].map((n) => backoffMs(n, policy, 1))).toEqual([2000, 4000, 8000, 16000]);
	});

	it('stops at the cap', () => {
		expect(backoffMs(10, policy, 1)).toBe(60_000);
		expect(backoffMs(1000, policy, 1)).toBe(60_000);
	});

	it('treats no attempt as the first', () => {
		expect(backoffMs(0, policy, 1)).toBe(2000);
	});

	it('spreads between half and the whole delay with the jitter passed in', () => {
		expect(backoffMs(2, policy, 0)).toBe(2000);
		expect(backoffMs(2, policy, 0.5)).toBe(3000);
		expect(backoffMs(2, policy, 1)).toBe(4000);
	});
});

describe('exhausted', () => {
	it('is true from the last allowed attempt on', () => {
		expect([3, 4, 5].map((n) => exhausted(n, policy))).toEqual([false, true, true]);
	});
});
