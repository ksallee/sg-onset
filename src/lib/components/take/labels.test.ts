import { describe, expect, it } from 'vitest';
import { fieldsOf } from '$lib/model/catalogue';
import { cameraName, cellLabel, spoken, unitText } from './labels';

const def = (key: string) => fieldsOf('take').find((d) => d.key === key)!;

describe('unitText', () => {
	it('gives the unit a row shows once, beside its label', () => {
		expect(unitText(def('focalLength'), 'metric')).toBe('mm');
		expect(unitText(def('focusDistance'), 'metric')).toBe('m');
		expect(unitText(def('tilt'), 'metric')).toBe('°');
	});
	it('gives none for feet and inches, which say their own marks', () => {
		expect(unitText(def('focusDistance'), 'imperial')).toBe('');
	});
});

describe('spoken', () => {
	it('says the value with its unit, the degree sign with no space', () => {
		expect(spoken('4.2', def('focusDistance'), 'metric')).toBe('4.2 m');
		expect(spoken('-12.5', def('tilt'), 'metric')).toBe('-12.5°');
		expect(spoken('', def('tStop'), 'metric')).toBe('Not set');
	});
});

describe('cameraName', () => {
	it('names a setup by its letter', () => {
		expect(cameraName({ id: 's1', label: 'A', setup: { id: 's1', projectId: 'p', cameraLabel: 'A' } })).toBe('Cam A');
	});
	it('says when a take has no camera setup', () => {
		expect(cameraName({ id: '', label: '' })).toBe('No cam');
	});
	it('says when the setup a take is on is no longer in Gear', () => {
		expect(cameraName({ id: 'gone', label: '' })).toBe('Cam not in Gear');
	});
});

describe('cellLabel', () => {
	it('says the camera, the field and the value', () => {
		expect(cellLabel({ camera: 'Cam A', field: 'T-stop', value: '2.8' })).toBe('Cam A, T-stop, 2.8');
	});
	it('says a value from the lens', () => {
		expect(cellLabel({ camera: 'Cam A', field: 'Focal', value: '32 mm', locked: true })).toBe('Cam A, Focal, 32 mm, from the lens');
	});
	it('says the end value of a value that changed over the take', () => {
		expect(cellLabel({ camera: 'Cam B', field: 'Focal', value: '150 mm', end: { field: 'Focal end', value: '85 mm' } })).toBe('Cam B, Focal, 150 mm, Focal end 85 mm');
	});
	it('says what the changed mark shows', () => {
		expect(cellLabel({ camera: 'Cam A', field: 'Tilt', value: '-5°', changed: true })).toBe('Cam A, Tilt, -5°, changed since the take before');
	});
});
