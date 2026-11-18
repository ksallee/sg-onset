import { describe, expect, it } from 'vitest';
import { metres, parseLength } from '$lib/model/length';
import type { Lens, Take } from '$lib/model/types';
import { beforeRows, changedSince, takeBefore } from './before';
import { numberFields, visibleFields } from './fields';
import { groupTakes } from './groups';

const prime: Lens = { id: 'p', projectId: 'x', lensModel: '32', focalLength: 32 };
const zoom: Lens = { id: 'z', projectId: 'x', lensModel: '24-290', focalLength: 24, focalLengthMax: 290 };
const at = (min: number) => new Date(Date.UTC(2026, 10, 11, 9, min)).toISOString();
const take = (id: string, number: string, setup: string, min: number, rest: Partial<Take> = {}): Take => ({ id, slateId: 's', take: number, cameraSetupId: setup, startedAt: at(min), ...rest });
const def = (key: string) => numberFields().find((d) => d.key === key)!;

const a1 = take('a1', '1', 'A', 0, { lensId: 'p', tStop: 2.8, focusDistance: metres(4.2), tilt: -3 });
const b1 = take('b1', '1', 'B', 0, { lensId: 'z', focalLength: 150, focalLengthEnd: 85 });
const a2 = take('a2', '2', 'A', 5, { lensId: 'p', tStop: 4, focusDistance: metres(4.2), tilt: -3 });
const a3 = take('a3', '3', 'A', 9, { lensId: 'p', tStop: 4 });
const b3 = take('b3', '3', 'B', 9, { lensId: 'z', focalLength: 150 });
const groups = groupTakes([a1, b1, a2, a3, b3]);
const group = (n: string) => groups.find((g) => g.number === n)!;

describe('takeBefore', () => {
	it('is the same camera on the take number before the one on screen', () => {
		expect(takeBefore(groups, group('2'), 'A')).toEqual({ number: '1', take: a1 });
		expect(takeBefore(groups, group('3'), 'A')).toEqual({ number: '2', take: a2 });
	});
	it('is none when that camera was not on the take before, as the changed marks read it', () => {
		expect(takeBefore(groups, group('3'), 'B')).toBeUndefined();
	});
	it('is none for the first take, and with no take on screen', () => {
		expect(takeBefore(groups, group('1'), 'A')).toBeUndefined();
		expect(takeBefore(groups, undefined, 'A')).toBeUndefined();
		expect(takeBefore([], undefined, 'A')).toBeUndefined();
	});
});

describe('changedSince', () => {
	it('says a value differs from the take before', () => {
		expect(changedSince(def('tStop'), a2, a1, prime)).toBe(true);
		expect(changedSince(def('focusDistance'), a2, a1, prime)).toBe(false);
	});
	it('counts the end value of a value that changes over the take', () => {
		const b2 = take('b2', '2', 'B', 5, { lensId: 'z', focalLength: 150, focalLengthEnd: 50 });
		expect(changedSince(def('focalLength'), b2, b1, zoom)).toBe(true);
	});
	it('never marks a value from the lens, nor a take with nothing before', () => {
		expect(changedSince(def('focalLength'), a2, a1, prime)).toBe(false);
		expect(changedSince(def('tStop'), a2, undefined, prime)).toBe(false);
		expect(changedSince(def('tStop'), undefined, a1, prime)).toBe(false);
	});
});

describe('beforeRows', () => {
	it('gives each field the table shows: its short label, the value with its unit, and whether it changed', () => {
		const rows = beforeRows(visibleFields(false), a1, prime, a2, prime, 'metric');
		expect(rows).toEqual([
			{ key: 'focalLength', label: 'Focal', value: '32 mm', changed: false },
			{ key: 'focusDistance', label: 'Focus', value: '4.2 m', changed: false },
			{ key: 'tStop', label: 'T-stop', value: '2.8', changed: true },
			{ key: 'lensHeight', label: 'Height', value: '–', changed: false },
			{ key: 'tilt', label: 'Tilt', value: '-3°', changed: false }
		]);
	});
	it('says the end of a value that changed over the take, as the table does', () => {
		const [focal] = beforeRows(visibleFields(false), b1, zoom, b3, zoom, 'metric');
		expect(focal).toEqual({ key: 'focalLength', label: 'Focal', value: '150 → 85 mm', changed: true });
	});
	it('shows infinity as ∞ with no unit, and feet and inches by their marks', () => {
		const far = { ...a1, focusDistance: parseLength('inf', 'metric')!, lensHeight: metres(1.8288) };
		const rows = beforeRows(visibleFields(false), far, prime, undefined, undefined, 'imperial');
		expect(rows.find((r) => r.key === 'focusDistance')!.value).toBe('∞');
		expect(rows.find((r) => r.key === 'lensHeight')!.value).toBe('6\'');
	});
	it('follows every field when the table shows every field', () => {
		expect(beforeRows(visibleFields(true), a1, prime, a2, prime, 'metric').map((r) => r.key)).toEqual(visibleFields(true).map((d) => d.key));
	});
});
