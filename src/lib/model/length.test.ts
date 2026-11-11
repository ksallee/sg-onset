import { describe, expect, it } from 'vitest';
import { formatLength, metres, parseLength } from './length';

describe('parseLength', () => {
	it('reads feet and inches in the forms people type', () => {
		expect(parseLength(`6'`, 'imperial')?.m).toBe(1.8288);
		expect(parseLength(`6' 3"`, 'imperial')?.m).toBe(1.905);
		expect(parseLength(`6'3`, 'imperial')?.m).toBe(1.905);
		expect(parseLength('6ft 3in', 'imperial')?.m).toBe(1.905);
		expect(parseLength('6 feet 3 inches', 'imperial')?.m).toBe(1.905);
		expect(parseLength(`6' 3 1/2"`, 'imperial')?.m).toBe(1.9177);
		expect(parseLength(`6' 3.5"`, 'imperial')?.m).toBe(1.9177);
		expect(parseLength('75"', 'imperial')?.m).toBe(1.905);
		expect(parseLength('6.5ft', 'imperial')?.m).toBe(1.9812);
		expect(parseLength('6′ 3″', 'imperial')?.m).toBe(1.905);
	});

	it('reads metric with a unit', () => {
		expect(parseLength('1.2m', 'imperial')?.m).toBe(1.2);
		expect(parseLength('1,2 m', 'metric')?.m).toBe(1.2);
		expect(parseLength('120 cm', 'metric')?.m).toBe(1.2);
		expect(parseLength('1200mm', 'metric')?.m).toBe(1.2);
	});

	it('reads a bare number in the unit system given: feet or metres', () => {
		expect(parseLength('6', 'imperial')?.m).toBe(1.8288);
		expect(parseLength('6', 'metric')?.m).toBe(6);
		expect(parseLength('1.2', 'metric')?.m).toBe(1.2);
	});

	it('reads a negative length', () => {
		expect(parseLength(`-1' 6"`, 'imperial')?.m).toBe(-0.4572);
		expect(parseLength('-0.5 m', 'metric')?.m).toBe(-0.5);
	});

	it('reads infinity', () => {
		for (const text of ['inf', 'Infinity', '∞', 'INF']) expect(parseLength(text, 'metric')?.m).toBe('inf');
	});

	it('keeps what was typed and the system it was typed in', () => {
		expect(parseLength(` 6' 3" `, 'metric')).toEqual({ m: 1.905, entered: { text: `6' 3"`, system: 'imperial' } });
		expect(parseLength('1.2m', 'imperial')).toEqual({ m: 1.2, entered: { text: '1.2m', system: 'metric' } });
		expect(parseLength('6', 'imperial')).toEqual({ m: 1.8288, entered: { text: '6', system: 'imperial' } });
	});

	it('returns null for anything else', () => {
		for (const bad of ['', 'tall', `6' 3" 2`, '6 3', '1.2 km', `3" 6'`, '1/2']) expect(parseLength(bad, 'imperial')).toBeNull();
	});
});

describe('formatLength', () => {
	it('gives back the typed text when shown in the system it was typed in', () => {
		for (const text of [`6' 3 1/2"`, '6ft 3in', '75"', '6']) {
			expect(formatLength(parseLength(text, 'imperial')!, 'imperial')).toBe(text);
		}
		expect(formatLength(parseLength('120 cm', 'imperial')!, 'metric')).toBe('120 cm');
	});

	it('converts when shown in the other system', () => {
		expect(formatLength(parseLength(`6' 3"`, 'imperial')!, 'metric')).toBe('1.905 m');
		expect(formatLength(parseLength('1.2m', 'metric')!, 'imperial')).toBe(`3' 11"`);
	});

	it('formats a bare canonical value: feet and inches to the nearest inch, metres to the millimetre', () => {
		expect(formatLength(metres(1.8288), 'imperial')).toBe(`6'`);
		expect(formatLength(metres(1.905), 'imperial')).toBe(`6' 3"`);
		expect(formatLength(metres(0.1524), 'imperial')).toBe('6"');
		expect(formatLength(metres(1.82), 'imperial')).toBe(`6'`);
		expect(formatLength(metres(-0.4572), 'imperial')).toBe(`-1' 6"`);
		expect(formatLength(metres(0), 'imperial')).toBe('0"');
		expect(formatLength(metres(1.2), 'metric')).toBe('1.2 m');
		expect(formatLength(metres(1.23456), 'metric')).toBe('1.235 m');
	});

	it('formats infinity', () => {
		expect(formatLength({ m: 'inf' }, 'imperial')).toBe('∞');
		expect(formatLength(parseLength('inf', 'metric')!, 'metric')).toBe('inf');
	});
});
