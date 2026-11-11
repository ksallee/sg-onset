import { describe, expect, it } from 'vitest';
import { entryValue, formatNumber, keypadPress, startEntry, stepValue, type Entry, type Key, type NumberSpec } from './keypad';

const metres: NumberSpec = { min: 0, max: 99.99, decimals: 2, step: 0.1 };
const tilt: NumberSpec = { min: -90, max: 90, decimals: 1, step: 1 };
const focal: NumberSpec = { min: 24, max: 290, decimals: 0, step: 1 };

const type = (keys: Key[], spec: NumberSpec, from: Entry = startEntry(null)) => keys.reduce((e, k) => keypadPress(e, k, spec), from);

describe('startEntry', () => {
	it('shows the current value, fresh', () => {
		expect(startEntry(3.2)).toEqual({ text: '3.2', fresh: true });
		expect(startEntry(null)).toEqual({ text: '', fresh: true });
	});
});

describe('keypadPress', () => {
	it('types digits and one decimal point', () => {
		expect(type(['1', '2', '.', '5'], metres).text).toBe('12.5');
		expect(type(['1', '.', '.', '5'], metres).text).toBe('1.5');
	});
	it('replaces a fresh value on the first digit', () => {
		expect(type(['4'], metres, startEntry(3.2))).toEqual({ text: '4', fresh: false });
	});
	it('starts a decimal with a zero', () => {
		expect(type(['.', '5'], metres).text).toBe('0.5');
		expect(type(['.'], metres, startEntry(3.2)).text).toBe('0.');
	});
	it('drops a leading zero', () => {
		expect(type(['0', '5'], metres).text).toBe('5');
		expect(type(['0', '0'], metres).text).toBe('0');
	});
	it('stops at the decimals of the field', () => {
		expect(type(['1', '.', '2', '3', '4'], metres).text).toBe('1.23');
		expect(type(['8', '5', '.'], focal).text).toBe('85');
	});
	it('stops at the whole digits the range can hold', () => {
		expect(type(['1', '2', '3'], metres).text).toBe('12');
		expect(type(['2', '9', '0', '1'], focal).text).toBe('290');
	});
	it('backspaces, also on a fresh value', () => {
		expect(type(['1', '2', 'back'], metres).text).toBe('1');
		expect(type(['back'], metres, startEntry(3.2))).toEqual({ text: '3.', fresh: false });
		expect(type(['back'], metres).text).toBe('');
	});
	it('flips the sign where the range goes below zero', () => {
		expect(type(['5', 'sign'], tilt).text).toBe('-5');
		expect(type(['5', 'sign', 'sign'], tilt).text).toBe('5');
		expect(type(['sign', '5'], tilt).text).toBe('-5');
		expect(type(['sign'], tilt, startEntry(10))).toEqual({ text: '-10', fresh: false });
	});
	it('ignores the sign on a field that cannot be negative', () => {
		expect(type(['5', 'sign'], metres).text).toBe('5');
	});
	it('clears', () => {
		expect(type(['5', 'clear'], metres)).toEqual({ text: '', fresh: false });
	});
});

describe('entryValue', () => {
	it('is empty for nothing typed', () => {
		expect(entryValue({ text: '', fresh: false }, metres)).toBeNull();
		expect(entryValue({ text: '-', fresh: false }, tilt)).toBeNull();
	});
	it('reads the number', () => {
		expect(entryValue({ text: '3.', fresh: false }, metres)).toBe(3);
		expect(entryValue({ text: '-4.5', fresh: false }, tilt)).toBe(-4.5);
	});
	it('clamps to the range', () => {
		expect(entryValue({ text: '12', fresh: false }, focal)).toBe(24);
		expect(entryValue({ text: '-95', fresh: false }, tilt)).toBe(-90);
	});
});

describe('stepValue', () => {
	it('steps up and down without float dust', () => {
		expect(stepValue(3.2, 1, metres)).toBe(3.3);
		expect(stepValue(0.3, -1, metres)).toBe(0.2);
	});
	it('lands on the step grid from between two steps', () => {
		expect(stepValue(3.25, 1, metres)).toBe(3.3);
		expect(stepValue(3.25, -1, metres)).toBe(3.2);
	});
	it('stays in range', () => {
		expect(stepValue(90, 1, tilt)).toBe(90);
		expect(stepValue(24, -1, focal)).toBe(24);
	});
	it('starts from the nearest in-range value to zero when empty', () => {
		expect(stepValue(null, 1, tilt)).toBe(1);
		expect(stepValue(null, 1, focal)).toBe(25);
	});
});

describe('formatNumber', () => {
	it('trims trailing zeros, keeps the decimals asked for at most', () => {
		expect(formatNumber(3.2, 2)).toBe('3.2');
		expect(formatNumber(3, 2)).toBe('3');
		expect(formatNumber(2.456, 2)).toBe('2.46');
		expect(formatNumber(-4.5, 1)).toBe('-4.5');
	});
});
