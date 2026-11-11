import { describe, expect, it } from 'vitest';
import { FIELDS, SCOPES, endKey, fieldsOf, findField, type FieldDef } from './catalogue';

const defs: readonly FieldDef[] = FIELDS;

describe('FIELDS', () => {
	it('has every scope, and only known scopes', () => {
		for (const scope of SCOPES) expect(fieldsOf(scope).length).toBeGreaterThan(0);
		for (const def of defs) expect(SCOPES).toContain(def.scope);
	});

	it('has one entry per scope and key, and no key that collides with an end key', () => {
		const seen = new Set<string>();
		for (const def of defs) {
			seen.add(`${def.scope}.${def.key}`);
			if (def.end) seen.add(`${def.scope}.${endKey(def.key)}`);
		}
		expect(seen.size).toBe(defs.length + defs.filter((d) => d.end).length);
	});

	it('names each label message field.<scope>.<key>', () => {
		for (const def of defs) expect(def.labelKey).toBe(`field.${def.scope}.${def.key}`);
	});

	it('uses camelCase keys and never id or a parent link as a key', () => {
		for (const def of defs) {
			expect(def.key).toMatch(/^[a-z][A-Za-z]*$/);
			expect(['id', 'templateId', 'projectId', 'shootDayId', 'slateId', 'takeId']).not.toContain(def.key);
		}
	});

	it('gives options to every enum, a target to every ref, and a unit to every length', () => {
		for (const def of defs) {
			if (def.type === 'enum') expect(def.options?.length).toBeGreaterThan(0);
			if (def.type === 'ref') expect(SCOPES).toContain(def.ref);
			if (def.type === 'length') expect(def.unit).toBe('m');
			if (def.infinity) expect(def.type).toBe('length');
		}
	});

	it('stores OpenTrackIO units: metres, millimetres, degrees, hertz', () => {
		const unit = (scope: FieldDef['scope'], key: string) => findField(scope, key)?.def.unit;
		expect(unit('take', 'focusDistance')).toBe('m');
		expect(unit('take', 'lensHeight')).toBe('m');
		expect(unit('take', 'focalLength')).toBe('mm');
		expect(unit('lens', 'focalLength')).toBe('mm');
		expect(unit('take', 'tilt')).toBe('deg');
		expect(unit('take', 'shutterAngle')).toBe('deg');
		expect(unit('take', 'captureFrameRate')).toBe('Hz');
		expect(findField('take', 'captureFrameRate')?.def.type).toBe('rational');
	});

	it('carries the crosswalk names', () => {
		expect(findField('take', 'focusDistance')?.def.names).toEqual({
			crif: 'Tk Lens Focus',
			crifEnd: 'Tk Lens Focus End',
			omc: 'focusPosition',
			otk: 'lens.focusDistance',
			usd: 'focusDistance'
		});
		expect(findField('camera', 'cameraSerialNumber')?.def.names).toEqual({
			omc: 'cameraSerialNumber',
			otk: 'static.camera.serialNumber',
			ale: { arri: 'Camera_sn' }
		});
	});

	it('marks the values that change over a take', () => {
		const ranged = defs.filter((d) => d.end).map((d) => `${d.scope}.${d.key}`);
		expect(ranged.sort()).toEqual(
			['take.distanceToSubject', 'take.focalLength', 'take.focusDistance', 'take.lensHeight', 'take.roll', 'take.tilt'].sort()
		);
	});
});

describe('findField', () => {
	it('finds a field by its key, and by its end key', () => {
		expect(findField('take', 'tilt')).toMatchObject({ def: { key: 'tilt' }, end: false });
		expect(findField('take', 'tiltEnd')).toMatchObject({ def: { key: 'tilt' }, end: true });
	});

	it('finds nothing for an unknown key, or an end key on a field with no end', () => {
		expect(findField('take', 'nope')).toBeUndefined();
		expect(findField('take', 'tStopEnd')).toBeUndefined();
		expect(findField('lens', 'tilt')).toBeUndefined();
	});
});
