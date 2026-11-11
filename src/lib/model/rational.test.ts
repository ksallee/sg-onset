import { describe, expect, it } from 'vitest';
import { formatRational, parseFrameRate, parseRational, rational, rationalToNumber } from './rational';

describe('rational', () => {
	it('reduces to lowest terms', () => {
		expect(rational(48, 2)).toEqual({ num: 24, denom: 1 });
		expect(rational(48000, 2002)).toEqual({ num: 24000, denom: 1001 });
	});
});

describe('parseRational', () => {
	it('reads integers, fractions and decimals exactly', () => {
		expect(parseRational('24')).toEqual({ num: 24, denom: 1 });
		expect(parseRational(' 24000/1001 ')).toEqual({ num: 24000, denom: 1001 });
		expect(parseRational('1.3')).toEqual({ num: 13, denom: 10 });
		expect(parseRational('22.5')).toEqual({ num: 45, denom: 2 });
		expect(parseRational('1,8')).toEqual({ num: 9, denom: 5 });
	});

	it('returns null for anything else, and for zero or negative', () => {
		for (const bad of ['', 'abc', '24/0', '0', '-24', '1/2/3', '1e3']) expect(parseRational(bad)).toBeNull();
	});
});

describe('parseFrameRate', () => {
	it('snaps the NTSC decimals to their 1001 rationals', () => {
		expect(parseFrameRate('23.976')).toEqual({ num: 24000, denom: 1001 });
		expect(parseFrameRate('23.98')).toEqual({ num: 24000, denom: 1001 });
		expect(parseFrameRate('29.97')).toEqual({ num: 30000, denom: 1001 });
		expect(parseFrameRate('47.952')).toEqual({ num: 48000, denom: 1001 });
		expect(parseFrameRate('59.94')).toEqual({ num: 60000, denom: 1001 });
		expect(parseFrameRate('119.88')).toEqual({ num: 120000, denom: 1001 });
	});

	it('keeps every other rate exact', () => {
		expect(parseFrameRate('24')).toEqual({ num: 24, denom: 1 });
		expect(parseFrameRate('25')).toEqual({ num: 25, denom: 1 });
		expect(parseFrameRate('22.5')).toEqual({ num: 45, denom: 2 });
		expect(parseFrameRate('99.9')).toEqual({ num: 999, denom: 10 });
		expect(parseFrameRate('48 fps')).toEqual({ num: 48, denom: 1 });
		expect(parseFrameRate('fast')).toBeNull();
	});
});

describe('formatRational', () => {
	it('shows whole numbers bare and the rest to three places', () => {
		expect(formatRational({ num: 24, denom: 1 })).toBe('24');
		expect(formatRational({ num: 24000, denom: 1001 })).toBe('23.976');
		expect(formatRational({ num: 30000, denom: 1001 })).toBe('29.97');
		expect(formatRational({ num: 60000, denom: 1001 })).toBe('59.94');
		expect(formatRational({ num: 13, denom: 10 })).toBe('1.3');
	});

	it('round-trips through parseFrameRate', () => {
		for (const text of ['24', '23.976', '29.97', '59.94', '22.5', '120']) expect(formatRational(parseFrameRate(text)!)).toBe(text);
	});
});

describe('rationalToNumber', () => {
	it('divides', () => {
		expect(rationalToNumber({ num: 45, denom: 2 })).toBe(22.5);
	});
});
