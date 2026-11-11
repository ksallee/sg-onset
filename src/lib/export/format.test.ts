import { describe, expect, it } from 'vitest';
import { crifDate, crifTime, crifTimestamp, feetInches, metresText, signed, trimNumber } from './format';

describe('trimNumber', () => {
	it('drops trailing zeros and float noise', () => {
		expect(trimNumber(2.8)).toBe('2.8');
		expect(trimNumber(0.1 + 0.2)).toBe('0.3');
		expect(trimNumber(5600)).toBe('5600');
		expect(trimNumber(-0)).toBe('0');
	});
});

describe('signed', () => {
	it('writes a plus on positive angles, as CRIF does', () => {
		expect(signed(10)).toBe('+10');
		expect(signed(-5)).toBe('-5');
		expect(signed(0)).toBe('0');
		expect(signed(2.5)).toBe('+2.5');
	});
});

describe('feetInches', () => {
	it('writes feet and inches, inches to the hundredth', () => {
		expect(feetInches(3.048)).toBe(`10' 0"`);
		expect(feetInches(1.9177)).toBe(`6' 3.5"`);
		expect(feetInches(1.2)).toBe(`3' 11.24"`);
		expect(feetInches(0.1524)).toBe(`0' 6"`);
	});

	it('carries 12 inches into a foot', () => {
		expect(feetInches(0.30479)).toBe(`1' 0"`);
	});

	it('keeps the sign below the floor', () => {
		expect(feetInches(-0.3048)).toBe(`-1' 0"`);
	});

	it('writes infinity as CRIF does', () => {
		expect(feetInches('inf')).toBe('Infinity');
	});
});

describe('metresText', () => {
	it('writes metres to the millimetre', () => {
		expect(metresText(1.9177)).toBe('1.918 m');
		expect(metresText(3)).toBe('3 m');
		expect(metresText('inf')).toBe('Infinity');
	});
});

describe('CRIF dates and times', () => {
	const iso = '2026-11-10T22:15:30.000Z';
	it('writes local time in YYYY/MM/DD 24HH:MM:SS', () => {
		expect(crifTimestamp(iso, 'UTC')).toBe('2026/11/10 22:15:30');
		expect(crifTimestamp(iso, 'America/Los_Angeles')).toBe('2026/11/10 14:15:30');
		expect(crifTimestamp(iso, 'Asia/Tokyo')).toBe('2026/11/11 07:15:30');
	});

	it('writes midnight as 00, not 24', () => {
		expect(crifTimestamp('2026-11-10T00:05:00Z', 'UTC')).toBe('2026/11/10 00:05:00');
	});

	it('writes the time alone for a take start', () => {
		expect(crifTime(iso, 'Europe/Madrid')).toBe('23:15:30');
	});

	it('writes a model date with slashes', () => {
		expect(crifDate('2026-11-10')).toBe('2026/11/10');
	});

	it('gives empty text for a value that does not read', () => {
		expect(crifTimestamp('not a time', 'UTC')).toBe('');
		expect(crifTime('', 'UTC')).toBe('');
		expect(crifDate('10/11/2026')).toBe('');
	});
});
