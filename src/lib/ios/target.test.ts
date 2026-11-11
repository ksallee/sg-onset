import { describe, expect, it } from 'vitest';
import { CAPTURE_MM, GAP_MM, GLOVE_MM, IPAD_PX_PER_MM, captureTarget, mmToPx } from './target';

describe('mmToPx', () => {
	it('uses the iPad density, 132 px to the inch', () => {
		expect(IPAD_PX_PER_MM).toBeCloseTo(5.197, 3);
		expect(mmToPx(25.4)).toBe(132);
	});
	it('rounds to a whole pixel', () => {
		expect(mmToPx(15)).toBe(78);
		expect(mmToPx(20)).toBe(104);
		expect(mmToPx(3)).toBe(16);
	});
	it('takes another density', () => {
		expect(mmToPx(25.4, 163 / 25.4)).toBe(163);
	});
});

describe('captureTarget', () => {
	it('is 15 mm bare handed, 20 mm with gloves, 3 mm apart', () => {
		expect([CAPTURE_MM, GLOVE_MM, GAP_MM]).toEqual([15, 20, 3]);
		expect(captureTarget(false)).toEqual({ mm: 15, size: 78, gap: 16 });
		expect(captureTarget(true)).toEqual({ mm: 20, size: 104, gap: 16 });
	});
});
