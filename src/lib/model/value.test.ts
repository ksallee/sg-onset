import { describe, expect, it } from 'vitest';
import { sameValue } from './value';

describe('sameValue', () => {
	it('compares plain values', () => {
		expect(sameValue('A', 'A')).toBe(true);
		expect(sameValue('A', 'B')).toBe(false);
		expect(sameValue(32, 32)).toBe(true);
		expect(sameValue(32, '32')).toBe(false);
		expect(sameValue(true, false)).toBe(false);
	});

	// FPT stores an unticked checkbox as no value (lib/fpt README, "Where FPT did not fit"). Only a
	// boolean field holds false, so false and missing are one value: a stored false never reads
	// as a conflict against an unticked box.
	it('treats false and a missing value as one', () => {
		expect(sameValue(false, undefined)).toBe(true);
		expect(sameValue(null, false)).toBe(true);
		expect(sameValue(false, false)).toBe(true);
		expect(sameValue(true, undefined)).toBe(false);
		expect(sameValue(0, undefined)).toBe(false);
		expect(sameValue('', false)).toBe(false);
	});

	// FPT keeps a date-time to the second and answers it as YYYY-MM-DDTHH:MM:SSZ (corpus
	// findings/field_types/date_time.md). A time stamped here as .000Z is the same moment.
	it('compares two timestamps by the moment they name', () => {
		expect(sameValue('2026-11-11T09:01:02.000Z', '2026-11-11T09:01:02Z')).toBe(true);
		expect(sameValue('2026-11-11T09:01:02.500Z', '2026-11-11T09:01:02Z')).toBe(false);
		expect(sameValue('2026-11-11T09:01:03Z', '2026-11-11T09:01:02Z')).toBe(false);
		expect(sameValue('2026-11-11', '2026-11-11T00:00:00Z')).toBe(false);
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
