import { describe, expect, it } from 'vitest';
import { sameValue } from '$lib/model/value';
import { INFINITY_M, isWholeSecond, readValue, writeValue } from './convert';
import { fieldMap, type EntityScope } from './mapping';

const map = (scope: EntityScope, key: string) => fieldMap(scope, key)!;
const out = (scope: EntityScope, key: string, value: unknown) => writeValue(map(scope, key), value);
const back = (scope: EntityScope, key: string, ...raw: unknown[]) => readValue(map(scope, key), raw);

describe('writeValue', () => {
	it('sends text as it is, and nothing as null', () => {
		expect(out('take', 'filter', 'ND6')).toEqual(['ND6']);
		expect(out('take', 'filter', undefined)).toEqual([null]);
		expect(out('take', 'filter', '')).toEqual([null]);
	});

	// corpus findings/field_types/float.md: an Integer is refused, a numeric string is taken.
	it('sends a float as a numeric string with a decimal point, never a JSON integer', () => {
		expect(out('take', 'focalLength', 50)).toEqual(['50.0']);
		expect(out('take', 'focalLength', 27.5)).toEqual(['27.5']);
		expect(out('take', 'tilt', -12)).toEqual(['-12.0']);
		expect(out('take', 'tStop', 0.0000001)).toEqual(['0.0']);
		expect(out('take', 'tilt', undefined)).toEqual([null]);
	});

	// corpus findings/field_types/number.md: a Float is refused.
	it('sends an integer as a JSON integer', () => {
		expect(out('take', 'isoSpeed', 800)).toEqual([800]);
		expect(out('take', 'isoSpeed', undefined)).toEqual([null]);
	});

	// corpus findings/field_types/checkbox.md: null is refused; false is the only off state.
	it('sends a boolean as true or false, never null', () => {
		expect(out('take', 'circleTake', true)).toEqual([true]);
		expect(out('take', 'circleTake', false)).toEqual([false]);
		expect(out('take', 'circleTake', undefined)).toEqual([false]);
	});

	it('sends a length as metres', () => {
		expect(out('take', 'lensHeight', { m: 1.8288, entered: { text: "6'", system: 'imperial' } })).toEqual(['1.8288']);
		expect(out('take', 'lensHeight', { m: 2 })).toEqual(['2.0']);
		expect(out('take', 'lensHeightEnd', { m: -0.5 })).toEqual(['-0.5']);
	});

	it('sends a focus at infinity as a number no lens reaches', () => {
		expect(INFINITY_M).toBe(1_000_000_000);
		expect(out('take', 'focusDistance', { m: 'inf' })).toEqual(['1000000000.0']);
	});

	it('sends a rational as num/denom', () => {
		expect(out('take', 'captureFrameRate', { num: 24000, denom: 1001 })).toEqual(['24000/1001']);
		expect(out('lens', 'anamorphicSqueeze', { num: 2, denom: 1 })).toEqual(['2/1']);
	});

	// corpus findings/field_types/date_time.md: read back to the second, in UTC, with a Z.
	it('sends a timestamp to the second, in UTC', () => {
		expect(out('take', 'startedAt', '2026-11-11T10:22:33.456Z')).toEqual(['2026-11-11T10:22:33Z']);
		expect(out('take', 'startedAt', '2026-11-11T12:22:33+02:00')).toEqual(['2026-11-11T10:22:33Z']);
	});

	// corpus findings/145_time_fields.md: POST and PUT round `.999` up, a `_batch` create truncates.
	// Nothing finer than a second is sent, so every path stores the second the app stamped.
	it('never sends a fraction of a second, so no path rounds it', () => {
		expect(out('take', 'startedAt', '2026-11-11T14:22:05.999Z')).toEqual(['2026-11-11T14:22:05Z']);
		expect(out('take', 'startedAt', '2026-11-11T14:22:05.5Z')).toEqual(['2026-11-11T14:22:05Z']);
		expect(out('take', 'startedAt', '2026-11-11T09:22:05.999-05:00')).toEqual(['2026-11-11T14:22:05Z']);
		expect(out('take', 'endedAt', '2026-11-11T14:22:05.123456Z')).toEqual(['2026-11-11T14:22:05Z']);
		expect(isWholeSecond('2026-11-11T14:22:05Z')).toBe(true);
		expect(isWholeSecond('2026-11-11T14:22:05.000Z')).toBe(false);
	});

	it('sends a date, an enum and a timecode as their strings', () => {
		expect(out('shootDay', 'shootDate', '2026-11-11')).toEqual(['2026-11-11']);
		expect(out('slate', 'scriptTime', 'magicHour')).toEqual(['magicHour']);
		expect(out('take', 'timecodeStart', '01:02:03:04')).toEqual(['01:02:03:04']);
	});

	it('sends a list of strings as one comma-separated text', () => {
		expect(out('slate', 'vfxShots', ['SH010', 'SH020'])).toEqual(['SH010, SH020']);
		expect(out('slate', 'vfxShots', [])).toEqual([null]);
	});

	it('sends dimensions as width and height', () => {
		expect(out('camera', 'activeSensorPhysicalDimensions', { width: 27.99, height: 19.22 })).toEqual(['27.99', '19.22']);
		expect(out('camera', 'activeSensorResolution', { width: 4448, height: 3096 })).toEqual([4448, 3096]);
		expect(out('camera', 'activeSensorResolution', undefined)).toEqual([null, null]);
	});

	it('refuses a value of the wrong shape, with the reason', () => {
		expect(out('take', 'focalLength', 'fifty')).toEqual({ error: expect.stringContaining('focalLength') });
		expect(out('take', 'startedAt', 'yesterday')).toEqual({ error: expect.any(String) });
		expect(out('take', 'captureFrameRate', 24)).toEqual({ error: expect.any(String) });
		expect(out('take', 'isoSpeed', 800.5)).toEqual({ error: expect.any(String) });
		expect(out('take', 'filter', 6)).toEqual({ error: expect.any(String) });
	});
});

describe('readValue', () => {
	it('reads null as a missing value', () => {
		expect(back('take', 'filter', null)).toBeUndefined();
		expect(back('take', 'focalLength', null)).toBeUndefined();
		expect(back('take', 'isoSpeed', null)).toBeUndefined();
		expect(back('take', 'lensHeight', null)).toBeUndefined();
		expect(back('take', 'captureFrameRate', null)).toBeUndefined();
		expect(back('camera', 'activeSensorResolution', null, null)).toBeUndefined();
		expect(back('slate', 'vfxShots', null)).toBeUndefined();
	});

	// corpus findings/field_types/float.md: a float reads back as a JSON string.
	it('reads a float from the string the server answers', () => {
		expect(back('take', 'focalLength', '50.0')).toBe(50);
		expect(back('take', 'tilt', '-12.5')).toBe(-12.5);
	});

	it('reads an unticked checkbox as a missing value', () => {
		expect(back('take', 'circleTake', true)).toBe(true);
		expect(back('take', 'circleTake', false)).toBeUndefined();
	});

	it('reads a length, infinity included', () => {
		expect(back('take', 'lensHeight', '1.8288')).toEqual({ m: 1.8288 });
		expect(back('take', 'focusDistance', '1000000000.0')).toEqual({ m: 'inf' });
		expect(back('take', 'lensHeight', '1000000000.0')).toEqual({ m: 1_000_000_000 });
	});

	it('reads a rational, in lowest terms', () => {
		expect(back('take', 'captureFrameRate', '24000/1001')).toEqual({ num: 24000, denom: 1001 });
		expect(back('take', 'captureFrameRate', '48/2')).toEqual({ num: 24, denom: 1 });
		expect(back('take', 'captureFrameRate', '25')).toEqual({ num: 25, denom: 1 });
	});

	it('reads text, dates, timestamps and lists', () => {
		expect(back('take', 'filter', 'ND6')).toBe('ND6');
		expect(back('shootDay', 'shootDate', '2026-11-11')).toBe('2026-11-11');
		expect(back('take', 'startedAt', '2026-11-11T10:22:33Z')).toBe('2026-11-11T10:22:33Z');
		expect(back('slate', 'vfxShots', 'SH010, SH020 ,SH030')).toEqual(['SH010', 'SH020', 'SH030']);
	});

	it('reads dimensions', () => {
		expect(back('camera', 'activeSensorPhysicalDimensions', '27.99', '19.22')).toEqual({ width: 27.99, height: 19.22 });
		expect(back('camera', 'activeSensorResolution', 4448, 3096)).toEqual({ width: 4448, height: 3096 });
	});
});

describe('round trip', () => {
	const cases: [EntityScope, string, unknown][] = [
		['take', 'filter', 'ND6'],
		['take', 'focalLength', 50],
		['take', 'tStop', 2.8],
		['take', 'isoSpeed', 800],
		['take', 'circleTake', true],
		['take', 'lensHeight', { m: 1.8288, entered: { text: "6'", system: 'imperial' } }],
		['take', 'focusDistance', { m: 'inf', entered: { text: 'inf', system: 'metric' } }],
		['take', 'captureFrameRate', { num: 24000, denom: 1001 }],
		['take', 'startedAt', '2026-11-11T10:22:33Z'],
		['take', 'timecodeEnd', '01:02:03:04'],
		['shootDay', 'shootDate', '2026-11-11'],
		['shootDay', 'shootDay', 12],
		['slate', 'interiorExterior', 'ext'],
		['slate', 'vfxShots', ['SH010', 'SH020']],
		['camera', 'activeSensorPhysicalDimensions', { width: 27.99, height: 19.22 }],
		['camera', 'activeSensorResolution', { width: 4448, height: 3096 }],
		['lens', 'anamorphicSqueeze', { num: 13, denom: 10 }]
	];
	it.each(cases)('%s.%s comes back as the same value', (scope, key, value) => {
		const sent = writeValue(map(scope, key), value) as unknown[];
		expect(sameValue(readValue(map(scope, key), sent), value)).toBe(true);
	});
});
