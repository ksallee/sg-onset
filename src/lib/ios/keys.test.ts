import { describe, expect, it } from 'vitest';
import { radioStep, trapStep } from './keys';

describe('trapStep: Tab inside a modal sheet', () => {
	it('wraps from the last to the first, and Shift+Tab from the first to the last', () => {
		expect(trapStep(3, 2, false)).toBe(0);
		expect(trapStep(3, 0, true)).toBe(2);
	});
	it('leaves Tab to the browser inside the list', () => {
		expect(trapStep(3, 0, false)).toBeNull();
		expect(trapStep(3, 2, true)).toBeNull();
	});
	it('focus outside the sheet, or on the sheet itself, comes back in', () => {
		expect(trapStep(3, -1, false)).toBe(0);
		expect(trapStep(3, -1, true)).toBe(2);
	});
	it('nothing to focus: stay on the sheet', () => {
		expect(trapStep(0, -1, false)).toBe(-1);
	});
});

describe('radioStep: arrow keys in a radio group', () => {
	const on = [true, true, true, true];
	it('right and down go to the next, left and up to the one before, wrapping', () => {
		expect(radioStep('ArrowRight', 0, on)).toBe(1);
		expect(radioStep('ArrowDown', 3, on)).toBe(0);
		expect(radioStep('ArrowLeft', 0, on)).toBe(3);
		expect(radioStep('ArrowUp', 2, on)).toBe(1);
	});
	it('Home and End go to the first and last', () => {
		expect(radioStep('Home', 2, on)).toBe(0);
		expect(radioStep('End', 0, on)).toBe(3);
	});
	it('skips disabled options; other keys do nothing', () => {
		expect(radioStep('ArrowRight', 0, [true, false, false, true])).toBe(3);
		expect(radioStep('Home', 3, [false, true, true, true])).toBe(1);
		expect(radioStep('Enter', 0, on)).toBeNull();
		expect(radioStep('ArrowRight', 0, [true, false])).toBeNull();
	});
	it('with nothing checked, an arrow starts from the first', () => {
		expect(radioStep('ArrowRight', -1, on)).toBe(0);
	});
});
