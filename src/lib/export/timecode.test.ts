import { describe, expect, it } from 'vitest';
import { formatTimecode, isDropFrameRate, parseTimecode, timecodeBase } from './timecode';

const r = (num: number, denom = 1) => ({ num, denom });

describe('timecodeBase', () => {
	it('is the whole frame count timecode counts in', () => {
		expect(timecodeBase(r(24))).toBe(24);
		expect(timecodeBase(r(24000, 1001))).toBe(24);
		expect(timecodeBase(r(30000, 1001))).toBe(30);
		expect(timecodeBase(r(25))).toBe(25);
		expect(timecodeBase(r(60000, 1001))).toBe(60);
	});
});

describe('isDropFrameRate', () => {
	it('is true for 29.97 and 59.94 only', () => {
		expect(isDropFrameRate(r(30000, 1001))).toBe(true);
		expect(isDropFrameRate(r(60000, 1001))).toBe(true);
		expect(isDropFrameRate(r(24000, 1001))).toBe(false);
		expect(isDropFrameRate(r(30))).toBe(false);
	});
});

describe('parseTimecode and formatTimecode', () => {
	it('counts frames in non drop frame', () => {
		expect(parseTimecode('00:00:01:00', 24, false)).toBe(24);
		expect(parseTimecode('01:00:00:00', 25, false)).toBe(90000);
		expect(formatTimecode(90000, 25, false)).toBe('01:00:00:00');
		expect(formatTimecode(24 * 3600 * 24 + 5, 24, false)).toBe('00:00:00:05');
	});

	it('skips frames 0 and 1 of each minute but every tenth in drop frame', () => {
		expect(formatTimecode(1800, 30, true)).toBe('00:01:00;02');
		expect(parseTimecode('00:01:00;02', 30, true)).toBe(1800);
		expect(formatTimecode(17982, 30, true)).toBe('00:10:00;00');
		expect(parseTimecode('00:10:00;00', 30, true)).toBe(17982);
		expect(formatTimecode(1799, 30, true)).toBe('00:00:59;29');
		expect(parseTimecode('01:00:00;00', 30, true)).toBe(107892);
	});

	it('drops four frames a minute at 59.94', () => {
		expect(formatTimecode(3600, 60, true)).toBe('00:01:00;04');
		expect(parseTimecode('00:01:00;04', 60, true)).toBe(3600);
	});

	it('reads either separator', () => {
		expect(parseTimecode('00:01:00:02', 30, true)).toBe(1800);
		expect(parseTimecode('00:00:01;00', 24, false)).toBe(24);
	});

	it('gives null for text that is not timecode or a frame past the base', () => {
		expect(parseTimecode('1:00:00', 24, false)).toBeNull();
		expect(parseTimecode('00:00:00:24', 24, false)).toBeNull();
		expect(parseTimecode('00:01:00;00', 30, true)).toBeNull();
	});
});
