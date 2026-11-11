import { describe, expect, it } from 'vitest';
import { sameValue } from './value';

describe('sameValue', () => {
	it('compares plain values', () => {
		expect(sameValue('A', 'A')).toBe(true);
		expect(sameValue('A', 'B')).toBe(false);
		expect(sameValue(32, 32)).toBe(true);
		expect(sameValue(32, '32')).toBe(false);
		expect(sameValue(false, undefined)).toBe(false);
	});

	it('treats undefined and null as the same absence', () => {
		expect(sameValue(undefined, undefined)).toBe(true);
		expect(sameValue(undefined, null)).toBe(true);
		expect(sameValue('', undefined)).toBe(false);
	});

	it('compares rationals and dimensions by content', () => {
		expect(sameValue({ num: 24000, denom: 1001 }, { num: 24000, denom: 1001 })).toBe(true);
		expect(sameValue({ num: 24, denom: 1 }, { num: 25, denom: 1 })).toBe(false);
		expect(sameValue({ width: 4608, height: 3164 }, { height: 3164, width: 4608 })).toBe(true);
	});

	it('compares lists in order', () => {
		expect(sameValue(['a', 'b'], ['a', 'b'])).toBe(true);
		expect(sameValue(['a', 'b'], ['b', 'a'])).toBe(false);
		expect(sameValue(['a'], ['a', 'b'])).toBe(false);
	});

	it('compares lengths by their metres, whatever was typed', () => {
		const typed = { m: 1.8288, entered: { text: `6'`, system: 'imperial' } };
		expect(sameValue(typed, { m: 1.8288 })).toBe(true);
		expect(sameValue(typed, { m: 1.8288, entered: { text: '6 ft', system: 'imperial' } })).toBe(true);
		expect(sameValue(typed, { m: 1.9 })).toBe(false);
		expect(sameValue({ m: 'inf' }, { m: 'inf', entered: { text: '∞', system: 'metric' } })).toBe(true);
	});
});
