import { describe, expect, it } from 'vitest';
import { THIRD_STOPS, canStep, entryValue, formatNumber, hardwareKey, keypadPress, maxChars, repeatDelay, startEntry, stepValue, type Entry, type Key, type NumberSpec } from './keypad';

const metres: NumberSpec = { min: 0, max: 99.99, decimals: 2, step: 0.1 };
const tilt: NumberSpec = { min: -90, max: 90, decimals: 1, step: 1 };
const focal: NumberSpec = { min: 24, max: 290, decimals: 0, step: 1 };
const tStop: NumberSpec = { min: 0.7, max: 64, decimals: 1, step: 0.1, stops: THIRD_STOPS };
const height: NumberSpec = { min: 0, max: 99.99, decimals: 2, step: 0.05 };

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

describe('keypadPress, every sequence', () => {
	it('keeps one zero before the point, also under a minus', () => {
		expect(type(['0', '0', '.', '0', '5'], metres).text).toBe('0.05');
		expect(type(['sign', '0', '0', '7'], tilt).text).toBe('-7');
		expect(type(['sign', '.', '5'], tilt).text).toBe('-0.5');
		expect(type(['0', '.', '0', '0'], metres).text).toBe('0.00');
	});
	it('ignores a second point wherever it comes', () => {
		expect(type(['1', '.', '2', '.', '3'], metres).text).toBe('1.23');
		expect(type(['.', '.'], metres).text).toBe('0.');
		expect(type(['back', '.'], metres, startEntry(3.2)).text).toBe('3.');
	});
	it('leaves a fresh value alone on a point or a sign the field does not take', () => {
		expect(type(['.'], focal, startEntry(85))).toEqual({ text: '85', fresh: true });
		expect(type(['sign'], focal, startEntry(85))).toEqual({ text: '85', fresh: true });
	});
	it('flips the sign at any point of the typing, and of nothing', () => {
		expect(type(['1', '.', 'sign', '5'], tilt).text).toBe('-1.5');
		expect(type(['sign', 'sign'], tilt).text).toBe('');
		expect(type(['sign', 'back'], tilt).text).toBe('');
		expect(type(['sign', '4', 'back', 'back', '4'], tilt).text).toBe('4');
	});
	it('does not count the minus or the point as digits', () => {
		expect(type(['sign', '9', '0', '5'], tilt).text).toBe('-90');
		expect(type(['sign', '9', '0', '.', '5', '5'], tilt).text).toBe('-90.5');
		expect(type(['9', '9', '.', '9', '9', '9'], metres).text).toBe('99.99');
	});
	it('backspaces to empty and types again', () => {
		expect(type(['1', '.', '5', 'back', 'back', 'back'], metres)).toEqual({ text: '', fresh: false });
		expect(type(['back', 'back', 'back', 'back', 'back'], metres, startEntry(3.2)).text).toBe('');
		expect(type(['1', 'back', 'back', '7'], metres).text).toBe('7');
		expect(type(['sign', '5', 'back'], tilt).text).toBe('-');
	});
	it('frees a digit when one is deleted at the cap', () => {
		expect(type(['2', '9', '0', 'back', '5'], focal).text).toBe('295');
		expect(type(['1', '.', '2', '3', 'back', '9'], metres).text).toBe('1.29');
	});
	it('types over a value picked from a recent chip: the pick is fresh again', () => {
		const picked: Entry = { text: '1.8', fresh: true };
		expect(type(['4'], metres, picked)).toEqual({ text: '4', fresh: false });
		expect(type(['.', '5'], metres, picked).text).toBe('0.5');
		expect(type(['back'], metres, picked).text).toBe('1.');
		expect(type(['sign'], tilt, { text: '12', fresh: true }).text).toBe('-12');
	});
	it('does not clamp while typing: out of range text stays as typed', () => {
		expect(type(['9', '9', '9'], focal).text).toBe('999');
		expect(type(['0'], tStop).text).toBe('0');
	});
	it('clears a fresh value', () => {
		expect(type(['clear'], metres, startEntry(3.2))).toEqual({ text: '', fresh: false });
	});
	it('cuts a stored value with more places than the field keeps, so a digit can follow a backspace', () => {
		expect(startEntry(1.526, 2).text).toBe('1.53');
		expect(type(['back', '7'], metres, startEntry(3.14159, 2)).text).toBe('3.17');
	});
	it('never grows past the longest text the field can hold', () => {
		const keys: Key[] = ['sign', '9', '9', '9', '9', '.', '.', '9', '9', '9', '9', '0', 'sign', 'sign'];
		for (const spec of [metres, tilt, focal, tStop, height]) {
			let e = startEntry(null);
			for (const k of [...keys, ...keys]) {
				e = keypadPress(e, k, spec);
				expect(e.text.length).toBeLessThanOrEqual(maxChars(spec));
			}
		}
	});
});

describe('maxChars', () => {
	it('counts whole digits, the point and decimals, and a minus on a signed field', () => {
		expect(maxChars(metres)).toBe(5);
		expect(maxChars(tilt)).toBe(5);
		expect(maxChars(focal)).toBe(3);
		expect(maxChars({ min: 0, max: 999.99, decimals: 2, step: 0.1 })).toBe(6);
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
	it('reads a lone zero, a trailing point and trailing zeros', () => {
		expect(entryValue({ text: '0', fresh: false }, metres)).toBe(0);
		expect(entryValue({ text: '0.', fresh: false }, metres)).toBe(0);
		expect(entryValue({ text: '1.50', fresh: false }, metres)).toBe(1.5);
	});
	it('never gives a negative zero', () => {
		expect(entryValue({ text: '-0', fresh: false }, tilt)).toBe(0);
		expect(entryValue({ text: '-0.', fresh: false }, tilt)).toBe(0);
		expect(entryValue({ text: '-0.04', fresh: false }, tilt)).toBe(0);
	});
	it('clamps on commit at both ends, a typed zero under the minimum too', () => {
		expect(entryValue({ text: '999', fresh: false }, focal)).toBe(290);
		expect(entryValue({ text: '0', fresh: false }, tStop)).toBe(0.7);
		expect(entryValue({ text: '99', fresh: false }, tStop)).toBe(64);
	});
	it('rounds to the decimals of the field', () => {
		expect(entryValue({ text: '3.14159', fresh: false }, metres)).toBe(3.14);
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
	it('steps from empty in both directions', () => {
		expect(stepValue(null, 1, metres)).toBe(0.1);
		expect(stepValue(null, -1, metres)).toBe(0);
		expect(stepValue(null, -1, tilt)).toBe(-1);
		expect(stepValue(null, -1, focal)).toBe(24);
	});
	it('stops at the range limits and comes back onto the grid', () => {
		expect(stepValue(99.95, 1, metres)).toBe(99.99);
		expect(stepValue(99.99, 1, metres)).toBe(99.99);
		expect(stepValue(99.99, -1, metres)).toBe(99.9);
		expect(stepValue(0, -1, metres)).toBe(0);
		expect(stepValue(-90, -1, tilt)).toBe(-90);
		expect(stepValue(-89.5, -1, tilt)).toBe(-90);
	});
	it('steps below zero', () => {
		expect(stepValue(-4.5, 1, tilt)).toBe(-4);
		expect(stepValue(-4.5, -1, tilt)).toBe(-5);
		expect(stepValue(-0.5, 1, tilt)).toBe(0);
		expect(Object.is(stepValue(-1, 1, tilt), 0)).toBe(true);
	});
	it('holds a 0.05 grid over many steps', () => {
		let v: number | null = null;
		for (let i = 0; i < 40; i++) v = stepValue(v, 1, height);
		expect(v).toBe(2);
		for (let i = 0; i < 7; i++) v = stepValue(v, -1, height);
		expect(v).toBe(1.65);
	});
});

describe('stepValue on a stop series', () => {
	it('walks the third stops, not tenths', () => {
		expect(stepValue(2.8, 1, tStop)).toBe(3.2);
		expect(stepValue(2.8, -1, tStop)).toBe(2.5);
		expect(stepValue(8, 1, tStop)).toBe(9);
		expect(stepValue(11, 1, tStop)).toBe(13);
		expect(stepValue(1, -1, tStop)).toBe(0.9);
	});
	it('goes to the next stop from a value typed between two', () => {
		expect(stepValue(2.4, 1, tStop)).toBe(2.5);
		expect(stepValue(2.4, -1, tStop)).toBe(2.2);
		expect(stepValue(6.7, 1, tStop)).toBe(7.1);
	});
	it('stays in the range of the field and of the series', () => {
		expect(stepValue(64, 1, tStop)).toBe(64);
		expect(stepValue(0.7, -1, tStop)).toBe(0.7);
		expect(stepValue(2.8, -1, { ...tStop, min: 2.8 })).toBe(2.8);
		expect(stepValue(3, -1, { ...tStop, min: 2.9 })).toBe(2.9);
		expect(stepValue(20, 1, { ...tStop, max: 21 })).toBe(21);
		expect(stepValue(21, 1, { ...tStop, max: 21 })).toBe(21);
	});
	it('starts next to the minimum when empty', () => {
		expect(stepValue(null, 1, tStop)).toBe(0.8);
		expect(stepValue(null, -1, tStop)).toBe(0.7);
	});
	it('holds the full stops three steps apart, in rising order', () => {
		const full = [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32, 45, 64];
		for (const f of full) expect(THIRD_STOPS).toContain(f);
		for (let i = 1; i < full.length; i++) expect(THIRD_STOPS.indexOf(full[i]) - THIRD_STOPS.indexOf(full[i - 1])).toBe(3);
		expect([...THIRD_STOPS].sort((a, b) => a - b)).toEqual([...THIRD_STOPS]);
	});
});

describe('canStep', () => {
	it('is false at the limit, in that direction only', () => {
		expect(canStep(90, 1, tilt)).toBe(false);
		expect(canStep(90, -1, tilt)).toBe(true);
		expect(canStep(0, -1, metres)).toBe(false);
		expect(canStep(64, 1, tStop)).toBe(false);
		expect(canStep(0.7, -1, tStop)).toBe(false);
	});
	it('is true from empty: the first press sets a value', () => {
		expect(canStep(null, 1, metres)).toBe(true);
		expect(canStep(null, -1, metres)).toBe(true);
		expect(canStep(null, -1, focal)).toBe(true);
	});
});

describe('repeatDelay: hold to repeat', () => {
	it('waits before the first repeat, then speeds up to a floor', () => {
		expect(repeatDelay(0)).toBe(400);
		expect(repeatDelay(1)).toBe(120);
		expect(repeatDelay(40)).toBe(40);
		expect(repeatDelay(1000)).toBe(40);
	});
	it('never slows down once it repeats', () => {
		for (let n = 1; n < 60; n++) expect(repeatDelay(n + 1)).toBeLessThanOrEqual(repeatDelay(n));
	});
});

describe('hardwareKey: a keyboard on the desk', () => {
	const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => hardwareKey({ key, ...mods });
	it('types digits, the point (a comma too), minus and Backspace', () => {
		expect(k('7')).toBe('7');
		expect(k('.')).toBe('.');
		expect(k(',')).toBe('.');
		expect(k('-')).toBe('sign');
		expect(k('Backspace')).toBe('back');
		expect(k('Delete')).toBe('clear');
	});
	it('reads Enter as Next, Escape as Done, the arrows as the stepper', () => {
		expect(k('Enter')).toBe('next');
		expect(k('Escape')).toBe('done');
		expect(k('ArrowUp')).toBe('more');
		expect(k('ArrowDown')).toBe('less');
	});
	it('leaves shortcuts and every other key alone: nothing is pasted', () => {
		expect(k('v', { metaKey: true })).toBeNull();
		expect(k('v', { ctrlKey: true })).toBeNull();
		expect(k('1', { metaKey: true })).toBeNull();
		expect(k('5', { altKey: true })).toBeNull();
		expect(k('e')).toBeNull();
		expect(k('Tab')).toBeNull();
		expect(k(' ')).toBeNull();
		expect(k('12')).toBeNull();
		expect(k('Unidentified')).toBeNull();
	});
});

describe('formatNumber', () => {
	it('trims trailing zeros, keeps the decimals asked for at most', () => {
		expect(formatNumber(3.2, 2)).toBe('3.2');
		expect(formatNumber(3, 2)).toBe('3');
		expect(formatNumber(2.456, 2)).toBe('2.46');
		expect(formatNumber(-4.5, 1)).toBe('-4.5');
	});
	it('never writes a negative zero or an exponent', () => {
		expect(formatNumber(-0, 1)).toBe('0');
		expect(formatNumber(-0.04, 1)).toBe('0');
		expect(formatNumber(0.0000001, 6)).toBe('0');
	});
});
