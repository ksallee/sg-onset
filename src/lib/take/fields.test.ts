import { describe, expect, it } from 'vitest';
import { editableFields, fieldEditable, fieldValue, formatField, nextField, specFor } from './fields';
import { stepValue } from '$lib/ios/keypad';
import type { Lens } from './types';

const prime: Lens = { name: '40', kind: 'prime', focalLength: 40 };
const zoom: Lens = { name: '24-290', kind: 'zoom', min: 24, max: 290 };
const values = { focalLength: 85, focusDistance: 3.2, tStop: 2.8, cameraHeight: 1.5, tilt: -4 };

describe('specFor', () => {
	it('keeps a zoom focal length to the zoom range', () => {
		expect(specFor('focalLength', zoom)).toMatchObject({ min: 24, max: 290 });
	});
	it('stores metres, millimetres and degrees', () => {
		expect(specFor('focusDistance', prime).unit).toBe('unit.m');
		expect(specFor('focalLength', prime).unit).toBe('unit.mm');
		expect(specFor('tilt', prime)).toMatchObject({ unit: 'unit.deg', min: -90, max: 90 });
	});
	it('steps the T-stop by third stops, the other fields by their step', () => {
		const tStop = specFor('tStop', prime);
		expect(stepValue(2.8, 1, tStop)).toBe(3.2);
		expect(stepValue(5.6, -1, tStop)).toBe(5);
		expect(specFor('focusDistance', prime).stops).toBeUndefined();
		expect(stepValue(2.8, 1, specFor('focusDistance', prime))).toBe(2.9);
	});
});

describe('editable fields', () => {
	it('leaves out the focal length of a prime', () => {
		expect(fieldEditable('focalLength', prime)).toBe(false);
		expect(editableFields(prime)).toEqual(['focusDistance', 'tStop', 'cameraHeight', 'tilt']);
		expect(editableFields(zoom)[0]).toBe('focalLength');
	});
	it('walks to the next, and stops after the last', () => {
		expect(nextField('focalLength', zoom)).toBe('focusDistance');
		expect(nextField('tilt', zoom)).toBeNull();
	});
});

describe('fieldValue', () => {
	it('takes the focal length from a prime', () => {
		expect(fieldValue(values, 'focalLength', prime)).toBe(40);
		expect(fieldValue(values, 'focalLength', zoom)).toBe(85);
		expect(fieldValue(values, 'tilt', prime)).toBe(-4);
	});
});

describe('formatField', () => {
	it('is empty for no value', () => {
		expect(formatField(null, specFor('tilt', prime))).toBe('');
		expect(formatField(1.5, specFor('cameraHeight', prime))).toBe('1.5');
	});
});
