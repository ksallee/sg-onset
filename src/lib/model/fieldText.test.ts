import { describe, expect, it } from 'vitest';
import { FIELDS, findField, type FieldDef, type Scope } from './catalogue';
import { formatField, parseField } from './fieldText';
import { validateValue } from './validate';

const def = (scope: Scope, key: string) => findField(scope, key)!.def;
const parse = (scope: Scope, key: string, text: string, system: 'imperial' | 'metric' = 'imperial') => parseField(def(scope, key), text, system);
const value = (scope: Scope, key: string, text: string, system: 'imperial' | 'metric' = 'imperial') => {
	const result = parse(scope, key, text, system);
	return result.ok ? result.value : result.issue.key;
};

describe('parseField', () => {
	it('reads empty text as no value', () => {
		expect(parse('take', 'tStop', '  ')).toEqual({ ok: true, value: undefined });
		expect(parse('take', 'notes', '')).toEqual({ ok: true, value: undefined });
	});

	it('trims text', () => {
		expect(value('slate', 'slateUID', ' 24A ')).toBe('24A');
		expect(value('take', 'take', '3')).toBe('3');
	});

	it('reads numbers with the marks people add', () => {
		expect(value('take', 'focalLength', '32')).toBe(32);
		expect(value('take', 'focalLength', '32mm')).toBe(32);
		expect(value('take', 'tStop', 'T2.8')).toBe(2.8);
		expect(value('take', 'tStop', 'f/4')).toBe(4);
		expect(value('take', 'tStop', '2,8')).toBe(2.8);
		expect(value('take', 'shutterAngle', '172.8°')).toBe(172.8);
		expect(value('take', 'tilt', '+10')).toBe(10);
		expect(value('take', 'tilt', '-5 deg')).toBe(-5);
		expect(value('take', 'whiteBalance', '5600K')).toBe(5600);
		expect(value('take', 'isoSpeed', 'ISO 800')).toBe(800);
	});

	it('refuses text that is not a number', () => {
		expect(parse('take', 'tStop', 'wide open')).toEqual({ ok: false, issue: { key: 'validation.type', params: { type: 'number' } } });
		expect(value('take', 'tStop', '2.8 4')).toBe('validation.type');
		expect(value('take', 'isoSpeed', '800.5')).toBe('validation.integer');
	});

	it('refuses a value the catalogue rules out', () => {
		expect(parse('take', 'shutterAngle', '400')).toEqual({ ok: false, issue: { key: 'validation.max', params: { max: 360, unit: 'deg' } } });
		expect(value('take', 'focusDistance', '0')).toBe('validation.above');
		expect(value('take', 'lensHeight', 'inf')).toBe('validation.infinity');
	});

	it('reads a length in the system given, keeping what was typed', () => {
		expect(value('take', 'lensHeight', `6' 3"`)).toEqual({ m: 1.905, entered: { text: `6' 3"`, system: 'imperial' } });
		expect(value('take', 'lensHeight', '6')).toEqual({ m: 1.8288, entered: { text: '6', system: 'imperial' } });
		expect(value('take', 'lensHeight', '1.2', 'metric')).toEqual({ m: 1.2, entered: { text: '1.2', system: 'metric' } });
		expect(value('take', 'focusDistance', '∞')).toEqual({ m: 'inf', entered: { text: '∞', system: 'imperial' } });
		expect(value('take', 'lensHeight', 'high')).toBe('validation.type');
	});

	it('reads a frame rate as a rational, and a squeeze too', () => {
		expect(value('take', 'captureFrameRate', '23.976')).toEqual({ num: 24000, denom: 1001 });
		expect(value('take', 'captureFrameRate', '48fps')).toEqual({ num: 48, denom: 1 });
		expect(value('lens', 'anamorphicSqueeze', '2x')).toEqual({ num: 2, denom: 1 });
		expect(value('lens', 'anamorphicSqueeze', '1.3')).toEqual({ num: 13, denom: 10 });
		expect(value('take', 'captureFrameRate', 'slow')).toBe('validation.type');
	});

	it('reads yes and no', () => {
		for (const yes of ['yes', 'Y', 'true', '1', 'x']) expect(value('take', 'circleTake', yes)).toBe(true);
		for (const no of ['no', 'N', 'false', '0']) expect(value('take', 'circleTake', no)).toBe(false);
		expect(value('take', 'circleTake', 'maybe')).toBe('validation.type');
	});

	it('reads an option whatever its case', () => {
		expect(value('slate', 'scriptTime', 'Dusk')).toBe('dusk');
		expect(value('slate', 'scriptTime', 'MAGICHOUR')).toBe('magicHour');
		expect(value('slate', 'scriptTime', 'noon')).toBe('validation.option');
	});

	it('reads a list split on commas, semicolons or vertical tabs', () => {
		expect(value('slate', 'vfxShots', 'ABC_010, ABC_020;ABC_030\vABC_040,,')).toEqual(['ABC_010', 'ABC_020', 'ABC_030', 'ABC_040']);
	});

	it('reads dimensions as width by height', () => {
		expect(value('camera', 'activeSensorResolution', '4608 x 3164')).toEqual({ width: 4608, height: 3164 });
		expect(value('camera', 'activeSensorResolution', '4608×3164')).toEqual({ width: 4608, height: 3164 });
		expect(value('camera', 'activeSensorPhysicalDimensions', '27.99x19.22 mm')).toEqual({ width: 27.99, height: 19.22 });
		expect(value('camera', 'activeSensorResolution', '4K')).toBe('validation.type');
	});

	it('checks dates, timestamps and timecode', () => {
		expect(value('shootDay', 'shootDate', '2026-11-11')).toBe('2026-11-11');
		expect(value('shootDay', 'shootDate', '11/11/26')).toBe('validation.date');
		expect(value('take', 'timecodeStart', '01:08:59:23')).toBe('01:08:59:23');
		expect(value('take', 'timecodeStart', '1:8:59')).toBe('validation.timecode');
	});
});

describe('formatField', () => {
	const format = (scope: Scope, key: string, v: unknown, system: 'imperial' | 'metric' = 'imperial') => formatField(def(scope, key), v, system);

	it('shows nothing for no value', () => {
		expect(format('take', 'tStop', undefined)).toBe('');
	});

	it('shows each type as text that parses back', () => {
		expect(format('take', 'take', '3')).toBe('3');
		expect(format('take', 'tStop', 2.8)).toBe('2.8');
		expect(format('take', 'circleTake', true)).toBe('yes');
		expect(format('take', 'circleTake', false)).toBe('no');
		expect(format('take', 'captureFrameRate', { num: 24000, denom: 1001 })).toBe('23.976');
		expect(format('slate', 'vfxShots', ['ABC_010', 'ABC_020'])).toBe('ABC_010, ABC_020');
		expect(format('camera', 'activeSensorResolution', { width: 4608, height: 3164 })).toBe('4608 x 3164');
		expect(format('take', 'lensHeight', { m: 1.905 })).toBe(`6' 3"`);
		expect(format('take', 'lensHeight', { m: 1.905 }, 'metric')).toBe('1.905 m');
	});

	it('shows a length as it was typed', () => {
		const typed = parse('take', 'lensHeight', `6' 3 1/2"`);
		expect(typed.ok && format('take', 'lensHeight', typed.value)).toBe(`6' 3 1/2"`);
	});

	it('round-trips a sample of every field through text', () => {
		const samples: Record<FieldDef['type'], unknown> = {
			string: 'A001',
			ref: 'uuid-1',
			date: '2026-11-11',
			timestamp: '2026-11-11T10:00:00.000Z',
			timecode: '01:08:59:23',
			enum: undefined,
			integer: 800,
			number: 45,
			boolean: true,
			length: { m: 1.905 },
			rational: { num: 24, denom: 1 },
			dimensions: { width: 4608, height: 3164 },
			stringList: ['a', 'b']
		};
		for (const d of FIELDS as readonly FieldDef[]) {
			const sample = d.type === 'enum' ? d.options![0] : samples[d.type];
			expect(validateValue(d, sample), `${d.scope}.${d.key}`).toEqual([]);
			const back = parseField(d, formatField(d, sample, 'metric'), 'metric');
			expect(back.ok && formatField(d, back.value, 'metric'), `${d.scope}.${d.key}`).toBe(formatField(d, sample, 'metric'));
		}
	});
});
