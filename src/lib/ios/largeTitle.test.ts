import { describe, expect, it } from 'vitest';
import { LARGE_TITLE_H, barScrolled, titleProgress } from './largeTitle';

describe('titleProgress', () => {
	it('0 at the top, 1 once the large title is under the bar', () => {
		expect(titleProgress(0)).toBe(0);
		expect(titleProgress(LARGE_TITLE_H / 2)).toBeCloseTo(0.5);
		expect(titleProgress(LARGE_TITLE_H)).toBe(1);
		expect(titleProgress(500)).toBe(1);
	});
	it('pulling down past the top stays 0', () => {
		expect(titleProgress(-40)).toBe(0);
	});
});

describe('barScrolled', () => {
	it('the bar takes its material once content scrolls under it', () => {
		expect(barScrolled(0)).toBe(false);
		expect(barScrolled(1)).toBe(true);
		expect(barScrolled(0, true)).toBe(false);
		expect(barScrolled(LARGE_TITLE_H - 1, true)).toBe(false);
		expect(barScrolled(LARGE_TITLE_H, true)).toBe(true);
	});
});
