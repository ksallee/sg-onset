import { describe, expect, it } from 'vitest';
import { CAPTURE_MM, GAP_MM, GLOVE_MM, IPAD_MINI_PX_PER_MM, IPAD_PX_PER_MM, PALM_MM, captureTarget, isPalm, mmToPx, pxToMm } from './target';

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

describe('pxToMm', () => {
	it('is the way back from mmToPx', () => {
		expect(pxToMm(132)).toBeCloseTo(25.4, 5);
		expect(pxToMm(104)).toBeCloseTo(20, 0);
		expect(pxToMm(163, IPAD_MINI_PX_PER_MM)).toBeCloseTo(25.4, 5);
	});
});

describe('captureTarget', () => {
	it('is 15 mm bare handed, 20 mm with gloves, 3 mm apart', () => {
		expect([CAPTURE_MM, GLOVE_MM, GAP_MM]).toEqual([15, 20, 3]);
		expect(captureTarget(false)).toEqual({ mm: 15, size: 78, gap: 16 });
		expect(captureTarget(true)).toEqual({ mm: 20, size: 104, gap: 16 });
	});
});

describe('isPalm: a contact too wide to be a fingertip', () => {
	const touch = (width: number, height: number) => ({ pointerType: 'touch', width, height });
	it('lets a fingertip, a flat thumb and a gloved finger through', () => {
		expect(isPalm(touch(40, 44))).toBe(false);
		expect(isPalm(touch(mmToPx(20), mmToPx(16)))).toBe(false);
		expect(isPalm(touch(mmToPx(PALM_MM), mmToPx(PALM_MM)))).toBe(false);
	});
	it('stops a contact wider than the palm size on either axis', () => {
		expect(isPalm(touch(mmToPx(PALM_MM) + 1, 30))).toBe(true);
		expect(isPalm(touch(30, 260))).toBe(true);
	});
	it('trusts a touch that reports no size, a mouse and a pen', () => {
		expect(isPalm(touch(0, 0))).toBe(false);
		expect(isPalm(touch(1, 1))).toBe(false);
		expect(isPalm({ pointerType: 'mouse', width: 500, height: 500 })).toBe(false);
		expect(isPalm({ pointerType: 'pen', width: 500, height: 500 })).toBe(false);
	});
	it('takes another density', () => {
		expect(isPalm(touch(170, 20))).toBe(true);
		expect(isPalm(touch(170, 20), IPAD_MINI_PX_PER_MM)).toBe(false);
	});
});
