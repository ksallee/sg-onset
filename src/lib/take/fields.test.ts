import { describe, expect, it } from 'vitest';
import { metres, parseLength } from '$lib/model/length';
import { rational } from '$lib/model/rational';
import type { Lens, Take } from '$lib/model/types';
import { DEFAULT_FIELDS, entrySpec, isLocked, numberFields, shownValue, slotKey, visibleFields } from './fields';

const prime: Lens = { id: 'p', projectId: 'x', lensModel: '32', focalLength: 32 };
const zoom: Lens = { id: 'z', projectId: 'x', lensModel: '24-290', focalLength: 24, focalLengthMax: 290 };
const take: Take = { id: 't', slateId: 's', focalLength: 150, focalLengthEnd: 85, focusDistance: metres(4.2), lensHeight: parseLength("5' 6\"", 'imperial')!, tStop: 2.8, captureFrameRate: rational(24000, 1001) };

describe('numberFields', () => {
	it('is every number of a take in the catalogue, the default set first', () => {
		const keys = numberFields().map((d) => d.key);
		expect(keys.slice(0, 5)).toEqual([...DEFAULT_FIELDS]);
		expect(keys).toEqual(expect.arrayContaining(['roll', 'distanceToSubject', 'captureFrameRate', 'shutterAngle', 'isoSpeed', 'whiteBalance']));
		expect(keys).not.toContain('notes');
		expect(keys).not.toContain('startedAt');
		expect(new Set(keys).size).toBe(keys.length);
	});
	it('shows the default set, or all', () => {
		expect(visibleFields(false).map((d) => d.key)).toEqual([...DEFAULT_FIELDS]);
		expect(visibleFields(true)).toHaveLength(numberFields().length);
	});
});

describe('isLocked', () => {
	const focal = numberFields()[0];
	it('locks a prime focal length, not a zoom one', () => {
		expect(isLocked(focal, prime)).toBe(true);
		expect(isLocked(focal, zoom)).toBe(false);
		expect(isLocked(focal, undefined)).toBe(false);
		expect(isLocked(numberFields()[2], prime)).toBe(false);
	});
});

describe('slotKey', () => {
	it('stores the end under <key>End', () => {
		expect(slotKey('tilt', false)).toBe('tilt');
		expect(slotKey('tilt', true)).toBe('tiltEnd');
	});
});

describe('shownValue', () => {
	const def = (key: string) => numberFields().find((d) => d.key === key)!;
	it('gives a prime focal length from the lens, a zoom one from the take', () => {
		expect(shownValue(def('focalLength'), take, prime, 'metric')).toBe('32');
		expect(shownValue(def('focalLength'), take, prime, 'metric', true)).toBe('');
		expect(shownValue(def('focalLength'), take, zoom, 'metric')).toBe('150');
		expect(shownValue(def('focalLength'), take, zoom, 'metric', true)).toBe('85');
	});
	it('shows lengths in the units set, with no unit word in metric', () => {
		expect(shownValue(def('focusDistance'), take, prime, 'metric')).toBe('4.2');
		expect(shownValue(def('focusDistance'), take, prime, 'imperial')).toBe('13\' 9"');
		expect(shownValue(def('lensHeight'), take, prime, 'imperial')).toBe('5\' 6"');
		expect(shownValue(def('lensHeight'), take, prime, 'metric')).toBe('1.676');
	});
	it('shows other numbers short, and nothing for no value', () => {
		expect(shownValue(def('tStop'), take, prime, 'metric')).toBe('2.8');
		expect(shownValue(def('captureFrameRate'), take, prime, 'metric')).toBe('23.976');
		expect(shownValue(def('tilt'), take, prime, 'metric')).toBe('');
	});
});

describe('entrySpec', () => {
	const def = (key: string) => numberFields().find((d) => d.key === key)!;
	it('keeps a zoom focal length to its range', () => {
		expect(entrySpec(def('focalLength'), 'metric', zoom)).toMatchObject({ mode: 'number', spec: { min: 24, max: 290 } });
	});
	it('types imperial lengths in feet and inches, metric ones as numbers', () => {
		expect(entrySpec(def('lensHeight'), 'imperial', undefined).mode).toBe('feetInches');
		expect(entrySpec(def('lensHeight'), 'metric', undefined)).toMatchObject({ mode: 'number', spec: { decimals: 2 } });
	});
	it('takes the range from the catalogue, signs where it goes below zero', () => {
		expect(entrySpec(def('tilt'), 'metric', undefined)).toMatchObject({ mode: 'number', spec: { min: -90, max: 90 } });
		expect(entrySpec(def('isoSpeed'), 'metric', undefined)).toMatchObject({ mode: 'number', spec: { decimals: 0 } });
	});
	it('offers infinity where the catalogue does', () => {
		expect(entrySpec(def('focusDistance'), 'metric', undefined).infinity).toBe(true);
		expect(entrySpec(def('lensHeight'), 'metric', undefined).infinity).toBe(false);
	});
});
