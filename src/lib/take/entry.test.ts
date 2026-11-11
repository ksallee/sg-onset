import { describe, expect, it } from 'vitest';
import { numberFields, entrySpec } from './fields';
import { commitEntry, pressEntry, startEntry, stepEntry, type EntryKey, type FieldEntry } from './entry';

const def = (key: string) => numberFields().find((d) => d.key === key)!;
const type = (entry: FieldEntry, keys: EntryKey[], spec: ReturnType<typeof entrySpec>) => keys.reduce((e, k) => pressEntry(e, k, spec), entry);

describe('number entry', () => {
	const tStop = entrySpec(def('tStop'), 'metric', undefined);
	it('replaces the shown value with the first key, then types', () => {
		const e = type(startEntry('2.8'), ['4'], tStop);
		expect(e).toEqual({ text: '4', fresh: false });
		expect(type(e, ['.', '5'], tStop).text).toBe('4.5');
	});
	it('commits a number in range as the stored value', () => {
		expect(commitEntry(def('tStop'), false, { text: '5.6', fresh: false }, tStop, 'metric')).toEqual({ ok: true, value: 5.6 });
	});
	it('commits a metric length as metres', () => {
		const focus = entrySpec(def('focusDistance'), 'metric', undefined);
		const r = commitEntry(def('focusDistance'), false, { text: '3.5', fresh: false }, focus, 'metric');
		expect(r).toMatchObject({ ok: true, value: { m: 3.5 } });
	});
	it('takes infinity where the field does', () => {
		const focus = entrySpec(def('focusDistance'), 'metric', undefined);
		const e = type(startEntry('3'), ['inf'], focus);
		expect(e.text).toBe('inf');
		expect(commitEntry(def('focusDistance'), false, e, focus, 'metric')).toMatchObject({ ok: true, value: { m: 'inf' } });
		expect(type(e, ['4'], focus).text).toBe('4');
	});
	it('commits an empty entry as no value, and a fresh one as no change', () => {
		expect(commitEntry(def('tStop'), false, { text: '', fresh: false }, tStop, 'metric')).toEqual({ ok: true, value: undefined });
		expect(commitEntry(def('tStop'), false, startEntry('2.8'), tStop, 'metric')).toEqual({ ok: true, unchanged: true });
	});
	it('reads a frame rate as a rational', () => {
		const fps = entrySpec(def('captureFrameRate'), 'metric', undefined);
		expect(commitEntry(def('captureFrameRate'), false, { text: '23.976', fresh: false }, fps, 'metric')).toEqual({ ok: true, value: { num: 24000, denom: 1001 } });
	});
	it('steps from the value typed', () => {
		const tilt = entrySpec(def('tilt'), 'metric', undefined);
		expect(stepEntry({ text: '-3', fresh: true }, 1, tilt, 'metric', def('tilt')).text).toBe('-2');
		expect(stepEntry({ text: '', fresh: true }, -1, tilt, 'metric', def('tilt')).text).toBe('-1');
	});
	it('gives the issue when a value is out of the catalogue range', () => {
		const roll = entrySpec(def('focusDistance'), 'metric', undefined);
		expect(commitEntry(def('focusDistance'), false, { text: '0', fresh: false }, roll, 'metric')).toMatchObject({ ok: false, issue: { key: 'validation.above' } });
	});
});

describe('feet and inches entry', () => {
	const height = entrySpec(def('lensHeight'), 'imperial', undefined);
	it('types feet, the feet mark, inches and the inch mark', () => {
		const e = type(startEntry("5' 6\""), ['5', 'feet', '1', '0', 'inches'], height);
		expect(e.text).toBe('5\' 10"');
		expect(commitEntry(def('lensHeight'), false, e, height, 'imperial')).toMatchObject({ ok: true, value: { m: 1.778, entered: { text: '5\' 10"', system: 'imperial' } } });
	});
	it('takes a bare number as feet, and inches without their mark', () => {
		expect(commitEntry(def('lensHeight'), false, { text: '6', fresh: false }, height, 'imperial')).toMatchObject({ ok: true, value: { m: 1.8288 } });
		expect(commitEntry(def('lensHeight'), false, { text: "6' 3", fresh: false }, height, 'imperial')).toMatchObject({ ok: true, value: { m: 1.905 } });
	});
	it('takes one feet mark and one inch mark, and deletes back over them', () => {
		const e = type(startEntry(''), ['feet', '5', 'feet', 'feet', '6', 'inches', 'inches'], height);
		expect(e.text).toBe('5\' 6"');
		expect(type(e, ['back', 'back'], height).text).toBe("5'");
		expect(type(e, ['back', 'back', 'back'], height).text).toBe('5');
	});
	it('steps an inch at a time', () => {
		expect(stepEntry({ text: '5\' 11"', fresh: false }, 1, height, 'imperial', def('lensHeight')).text).toBe("6'");
		expect(stepEntry({ text: '', fresh: true }, 1, height, 'imperial', def('lensHeight')).text).toBe('1"');
	});
});
