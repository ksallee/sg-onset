import { describe, expect, it } from 'vitest';
import { findField, type Scope } from './catalogue';
import { validateRecord, validateValue } from './validate';

const check = (scope: Scope, key: string, value: unknown) => validateValue(findField(scope, key)!.def, value);
const keys = (scope: Scope, key: string, value: unknown) => check(scope, key, value).map((i) => i.key);

describe('validateValue', () => {
	it('passes a good value of every type', () => {
		expect(check('slate', 'slateUID', '24A')).toEqual([]);
		expect(check('shootDay', 'shootDate', '2026-11-11')).toEqual([]);
		expect(check('take', 'startedAt', '2026-11-11T10:00:00.000Z')).toEqual([]);
		expect(check('take', 'timecodeStart', '01:08:59:23')).toEqual([]);
		expect(check('take', 'timecodeStart', '01:08:59;28')).toEqual([]);
		expect(check('take', 'lensId', 'some-uuid')).toEqual([]);
		expect(check('slate', 'scriptTime', 'dusk')).toEqual([]);
		expect(check('take', 'isoSpeed', 800)).toEqual([]);
		expect(check('take', 'tStop', 2.8)).toEqual([]);
		expect(check('take', 'circleTake', true)).toEqual([]);
		expect(check('take', 'lensHeight', { m: 1.2 })).toEqual([]);
		expect(check('take', 'lensHeight', { m: -0.5 })).toEqual([]);
		expect(check('take', 'focusDistance', { m: 'inf' })).toEqual([]);
		expect(check('take', 'captureFrameRate', { num: 24000, denom: 1001 })).toEqual([]);
		expect(check('camera', 'activeSensorResolution', { width: 4608, height: 3164 })).toEqual([]);
		expect(check('camera', 'activeSensorPhysicalDimensions', { width: 27.99, height: 19.22 })).toEqual([]);
		expect(check('slate', 'vfxShots', ['ABC_010', 'ABC_020'])).toEqual([]);
	});

	it('passes a missing value unless the field is required', () => {
		expect(check('take', 'tStop', undefined)).toEqual([]);
		expect(check('take', 'notes', '')).toEqual([]);
		expect(keys('slate', 'slateUID', undefined)).toEqual(['validation.required']);
		expect(keys('slate', 'slateUID', '  ')).toEqual(['validation.required']);
		expect(keys('take', 'take', null)).toEqual(['validation.required']);
	});

	it('reports the wrong type, naming the type wanted', () => {
		expect(check('take', 'tStop', '2.8')).toEqual([{ key: 'validation.type', params: { type: 'number' } }]);
		expect(keys('take', 'notes', 5)).toEqual(['validation.type']);
		expect(keys('take', 'circleTake', 'yes')).toEqual(['validation.type']);
		expect(keys('take', 'tStop', Number.NaN)).toEqual(['validation.type']);
		expect(keys('take', 'lensHeight', 1.2)).toEqual(['validation.type']);
		expect(keys('take', 'lensHeight', { m: '1.2' })).toEqual(['validation.type']);
		expect(keys('take', 'captureFrameRate', 24)).toEqual(['validation.type']);
		expect(keys('slate', 'vfxShots', 'ABC_010')).toEqual(['validation.type']);
		expect(keys('slate', 'vfxShots', [1])).toEqual(['validation.type']);
		expect(keys('camera', 'activeSensorResolution', { width: 4608 })).toEqual(['validation.type']);
	});

	it('reports a number out of range, with the bound and the unit', () => {
		expect(check('take', 'shutterAngle', 400)).toEqual([{ key: 'validation.max', params: { max: 360, unit: 'deg' } }]);
		expect(check('take', 'shutterAngle', -1)).toEqual([{ key: 'validation.min', params: { min: 0, unit: 'deg' } }]);
		expect(check('take', 'tilt', -91)).toEqual([{ key: 'validation.min', params: { min: -90, unit: 'deg' } }]);
		expect(check('take', 'focalLength', 0)).toEqual([{ key: 'validation.above', params: { above: 0, unit: 'mm' } }]);
		expect(check('take', 'tStop', 0)).toEqual([{ key: 'validation.above', params: { above: 0 } }]);
		expect(check('take', 'isoSpeed', 0)).toEqual([{ key: 'validation.min', params: { min: 1 } }]);
	});

	it('reports a fraction where a whole number is wanted', () => {
		expect(keys('take', 'isoSpeed', 800.5)).toEqual(['validation.integer']);
		expect(keys('shootDay', 'shootDay', 1.5)).toEqual(['validation.integer']);
		expect(keys('camera', 'activeSensorResolution', { width: 4608.5, height: 3164 })).toEqual(['validation.integer']);
	});

	it('checks a length in metres', () => {
		expect(check('take', 'focusDistance', { m: 0 })).toEqual([{ key: 'validation.above', params: { above: 0, unit: 'm' } }]);
		expect(check('take', 'distanceToSubject', { m: -1 })).toEqual([{ key: 'validation.min', params: { min: 0, unit: 'm' } }]);
	});

	it('allows infinity only where the field takes it', () => {
		expect(keys('take', 'lensHeight', { m: 'inf' })).toEqual(['validation.infinity']);
	});

	it('reports a length typed in an unknown unit system', () => {
		expect(keys('take', 'lensHeight', { m: 1.2, entered: { text: '4 cubits', system: 'biblical' } })).toEqual(['validation.unit']);
		expect(check('take', 'lensHeight', { m: 1.8288, entered: { text: `6'`, system: 'imperial' } })).toEqual([]);
	});

	it('reports a bad rational', () => {
		expect(keys('take', 'captureFrameRate', { num: 0, denom: 1 })).toEqual(['validation.rational']);
		expect(keys('take', 'captureFrameRate', { num: 24, denom: 0 })).toEqual(['validation.rational']);
		expect(keys('take', 'captureFrameRate', { num: 23.976, denom: 1 })).toEqual(['validation.rational']);
	});

	it('reports negative dimensions', () => {
		expect(keys('camera', 'activeSensorPhysicalDimensions', { width: -1, height: 19 })).toEqual(['validation.min']);
	});

	it('reports a value that is not one of the options', () => {
		expect(check('slate', 'scriptTime', 'noon')).toEqual([{ key: 'validation.option', params: { options: 'day, night, dusk, dawn, magicHour' } }]);
	});

	it('reports a malformed date, timestamp or timecode', () => {
		expect(keys('shootDay', 'shootDate', '11/11/2026')).toEqual(['validation.date']);
		expect(keys('shootDay', 'shootDate', '2026-13-40')).toEqual(['validation.date']);
		expect(keys('take', 'startedAt', 'this morning')).toEqual(['validation.timestamp']);
		expect(keys('take', 'startedAt', '2026-11-11T10:00:00')).toEqual(['validation.timestamp']);
		expect(keys('take', 'timecodeStart', '1:08:59:28')).toEqual(['validation.timecode']);
		expect(keys('take', 'timecodeStart', '24:00:00:00')).toEqual(['validation.timecode']);
		expect(keys('take', 'timecodeStart', '01:60:00:00')).toEqual(['validation.timecode']);
	});
});

describe('validateRecord', () => {
	it('returns nothing for a good record', () => {
		expect(validateRecord('take', { id: 't', slateId: 's', take: '1', tStop: 2.8, tilt: -5, tiltEnd: 0 })).toEqual({});
	});

	it('returns the issues by field key, end values under their end key', () => {
		expect(validateRecord('take', { id: 't', slateId: 's', tStop: 0, tilt: 0, tiltEnd: 120, focalLengthEnd: -5 })).toEqual({
			take: [{ key: 'validation.required' }],
			tStop: [{ key: 'validation.above', params: { above: 0 } }],
			tiltEnd: [{ key: 'validation.max', params: { max: 90, unit: 'deg' } }],
			focalLengthEnd: [{ key: 'validation.above', params: { above: 0, unit: 'mm' } }]
		});
	});

	it('never requires an end value', () => {
		expect(validateRecord('project', { id: 'p', name: 'Show' })).toEqual({});
		expect(validateRecord('project', { id: 'p' })).toEqual({ name: [{ key: 'validation.required' }] });
	});

	it('reports a take that ends before it starts', () => {
		const take = { id: 't', slateId: 's', take: '1', startedAt: '2026-11-11T10:01:00.000Z', endedAt: '2026-11-11T10:00:00.000Z' };
		expect(validateRecord('take', take)).toEqual({ endedAt: [{ key: 'validation.endBeforeStart' }] });
	});

	it('reports a zoom whose long end is not past its short end', () => {
		expect(validateRecord('lens', { id: 'l', projectId: 'p', lensModel: 'Optimo', focalLength: 70, focalLengthMax: 24 })).toEqual({
			focalLengthMax: [{ key: 'validation.focalRange' }]
		});
		expect(validateRecord('lens', { id: 'l', projectId: 'p', lensModel: 'Optimo', focalLength: 24, focalLengthMax: 70 })).toEqual({});
	});

	it('ignores keys the catalogue does not know', () => {
		expect(validateRecord('take', { id: 't', slateId: 's', take: '1', mystery: 42 })).toEqual({});
	});
});
