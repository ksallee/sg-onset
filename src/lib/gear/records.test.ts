import { describe, expect, it } from 'vitest';
import type { Camera, Lens } from '$lib/model/types';
import { checkEdit, draftRecord, duplicateGear, fieldText, formSelection, parseSelection } from './records';

describe('duplicateGear', () => {
	it('copies every field under a new id, but not the serial number', () => {
		const lens: Lens = { id: 'l1', projectId: 'p', lensMake: 'Cooke', lensModel: 'S4/i', lensSerialNumber: '123', focalLength: 32 };
		expect(duplicateGear('lens', lens, 'l2')).toEqual({ id: 'l2', projectId: 'p', lensMake: 'Cooke', lensModel: 'S4/i', focalLength: 32 });
		const cam: Camera = { id: 'c1', projectId: 'p', cameraModel: 'Alexa 35', cameraSerialNumber: 'K1' };
		expect(duplicateGear('camera', cam, 'c2')).toEqual({ id: 'c2', projectId: 'p', cameraModel: 'Alexa 35' });
	});
	it('does not change the record it copies', () => {
		const lens: Lens = { id: 'l1', projectId: 'p', lensSerialNumber: '123' };
		duplicateGear('lens', lens, 'l2');
		expect(lens.lensSerialNumber).toBe('123');
	});
});

describe('draftRecord', () => {
	it('reads every typed field into a record', () => {
		const d = draftRecord('lens', { lensMake: ' Cooke ', lensModel: 'S4/i', focalLength: '32mm', anamorphicSqueeze: '2' }, 'metric', 'l1', 'p');
		expect(d.ok).toBe(true);
		expect(d.record).toEqual({ id: 'l1', projectId: 'p', lensMake: 'Cooke', lensModel: 'S4/i', focalLength: 32, anamorphicSqueeze: { num: 2, denom: 1 } });
		expect(d.issues).toEqual({});
	});
	it('needs a model', () => {
		const d = draftRecord('camera', { cameraMake: 'ARRI' }, 'metric', 'c1', 'p');
		expect(d.ok).toBe(false);
		expect(d.issues.cameraModel?.key).toBe('validation.required');
	});
	it('gives the issue of a field that does not read, and of a range the wrong way round', () => {
		const d = draftRecord('lens', { lensModel: 'Z', focalLength: '100', focalLengthMax: '50' }, 'metric', 'l1', 'p');
		expect(d.ok).toBe(false);
		expect(d.issues.focalLengthMax?.key).toBe('validation.focalRange');
		const e = draftRecord('camera', { cameraModel: 'A', activeSensorResolution: '4608' }, 'metric', 'c1', 'p');
		expect(e.issues.activeSensorResolution?.key).toBe('validation.type');
	});
});

describe('checkEdit', () => {
	const zoom: Lens = { id: 'l', projectId: 'p', lensModel: 'Optimo', focalLength: 24, focalLengthMax: 290 };
	it('gives the value to save', () => {
		expect(checkEdit('lens', zoom, 'focalLengthMax', '300', 'metric')).toEqual({ ok: true, value: 300 });
		expect(checkEdit('lens', zoom, 'lensSerialNumber', '', 'metric')).toEqual({ ok: true, value: undefined });
	});
	it('refuses a long end under the short end, either way it is typed', () => {
		expect(checkEdit('lens', zoom, 'focalLengthMax', '12', 'metric')).toEqual({ ok: false, issue: { key: 'validation.focalRange' } });
		expect(checkEdit('lens', zoom, 'focalLength', '400', 'metric')).toEqual({ ok: false, issue: { key: 'validation.focalRange' } });
	});
	it('refuses clearing the model', () => {
		expect(checkEdit('lens', zoom, 'lensModel', '', 'metric')).toMatchObject({ ok: false, issue: { key: 'validation.required' } });
	});
});

describe('fieldText', () => {
	it('shows a stored value as text that reads back', () => {
		const cam: Camera = { id: 'c', projectId: 'p', activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 } };
		expect(fieldText('camera', cam, 'activeSensorPhysicalDimensions', 'metric')).toBe('27.99 x 19.22');
		expect(fieldText('camera', cam, 'cameraModel', 'metric')).toBe('');
	});
});

describe('parseSelection', () => {
	it('reads what the gear page shows from the address', () => {
		expect(parseSelection('camera.abc')).toEqual({ scope: 'camera', id: 'abc' });
		expect(parseSelection('cameraSetup.x-1')).toEqual({ scope: 'cameraSetup', id: 'x-1' });
		expect(parseSelection('take.abc')).toBeUndefined();
		expect(parseSelection('camera.')).toBeUndefined();
		expect(parseSelection(null)).toBeUndefined();
	});
	it('writes it back', () => {
		expect(formSelection({ scope: 'lens', id: 'l1' })).toBe('lens.l1');
	});
});
