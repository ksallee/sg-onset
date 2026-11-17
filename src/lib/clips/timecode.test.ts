import { describe, expect, it } from 'vitest';
import { clockSeconds, guessRate, lastFrame, localSeconds, readRate, tidyTimecode } from './timecode';

const r = (num: number, denom = 1) => ({ num, denom });

describe('readRate', () => {
	it('reads the rates ALE files write', () => {
		expect(readRate('24')).toEqual(r(24));
		expect(readRate('25.000')).toEqual(r(25));
		expect(readRate('24.00')).toEqual(r(24));
		expect(readRate('23.976')).toEqual(r(24000, 1001));
		expect(readRate('23.98')).toEqual(r(24000, 1001));
		expect(readRate('29.97')).toEqual(r(30000, 1001));
	});
	it('is null for no rate or one no timecode runs at', () => {
		expect(readRate(undefined)).toBeNull();
		expect(readRate('')).toBeNull();
		expect(readRate('fast')).toBeNull();
		expect(readRate('0')).toBeNull();
		expect(readRate('1000')).toBeNull();
	});
});

describe('guessRate', () => {
	it('is the smallest usual rate above every frame number', () => {
		expect(guessRate(['10:00:00:00', '10:00:01:23'])).toEqual(r(24));
		expect(guessRate(['10:00:00:24'])).toEqual(r(25));
		expect(guessRate(['10:00:00:29', 'nonsense'])).toEqual(r(30));
		expect(guessRate(['10:00:00:49'])).toEqual(r(50));
		expect(guessRate([])).toEqual(r(24));
	});
});

describe('tidyTimecode', () => {
	it('writes colons, and a semicolon before the frames of drop frame', () => {
		expect(tidyTimecode(' 14:02:11:04 ')).toEqual({ text: '14:02:11:04', dropFrame: false });
		expect(tidyTimecode('14:02:11;04')).toEqual({ text: '14:02:11;04', dropFrame: true });
		expect(tidyTimecode('14.02.11.04')).toEqual({ text: '14:02:11:04', dropFrame: false });
		expect(tidyTimecode('14:02:11.04')).toEqual({ text: '14:02:11:04', dropFrame: false });
	});
	it('is null for text that is not timecode', () => {
		expect(tidyTimecode('')).toBeNull();
		expect(tidyTimecode('14:02:11')).toBeNull();
		expect(tidyTimecode('2 min')).toBeNull();
	});
});

describe('clockSeconds', () => {
	it('is the time of day a timecode names, its frames a fraction of a second', () => {
		expect(clockSeconds('14:02:11:12', 24)).toBe(14 * 3600 + 2 * 60 + 11.5);
		expect(clockSeconds('00:00:00:00', 25)).toBe(0);
		expect(clockSeconds('14:02:11;15', 30)).toBe(14 * 3600 + 2 * 60 + 11.5);
		expect(clockSeconds('nope', 24)).toBeNull();
	});
});

describe('lastFrame', () => {
	const day = 24 * 86400;
	it('is the frame before an ALE End: End is the frame after the last', () => {
		expect(lastFrame(100, 148, undefined, day)).toBe(147);
		expect(lastFrame(100, 148, 48, day)).toBe(147);
	});
	it('is the End itself when the duration says End is the last frame', () => {
		expect(lastFrame(100, 147, 48, day)).toBe(147);
	});
	it('comes from the duration when there is no End', () => {
		expect(lastFrame(100, undefined, 48, day)).toBe(147);
		expect(lastFrame(100, undefined, undefined, day)).toBeUndefined();
		expect(lastFrame(100, undefined, 0, day)).toBeUndefined();
	});
	it('runs past midnight', () => {
		expect(lastFrame(day - 10, 10, undefined, day)).toBe(9);
		expect(lastFrame(day - 10, undefined, 20, day)).toBe(9);
	});
	it('is the first frame for a clip of one frame', () => {
		expect(lastFrame(100, 100, undefined, day)).toBe(100);
	});
});

describe('localSeconds', () => {
	it('is the time of day of a stored timestamp at an offset from UTC', () => {
		expect(localSeconds('2026-11-17T13:02:11Z', 60)).toBe(14 * 3600 + 2 * 60 + 11);
		expect(localSeconds('2026-11-17T13:02:11.500Z', 0)).toBe(13 * 3600 + 2 * 60 + 11.5);
		expect(localSeconds('2026-11-17T23:30:00Z', 60)).toBe(30 * 60);
		expect(localSeconds('2026-11-17T00:30:00Z', -120)).toBe(22.5 * 3600);
	});
	it('is undefined for no timestamp', () => {
		expect(localSeconds(undefined, 0)).toBeUndefined();
		expect(localSeconds('soon', 0)).toBeUndefined();
	});
});
