import { describe, expect, it } from 'vitest';
import { endKey, FIELDS } from '$lib/model/catalogue';
import { linkKeys } from '$lib/store/tables';
import { ENTITY_SCOPES, ENTITY_TYPES, fieldMap, fieldMaps, mappingTable, STILLS, UUID, wantedColumns, type EntityScope } from './mapping';
import { codeName } from './names';

const names = (scope: EntityScope) => wantedColumns(scope).map((c) => c.name);

describe('fieldMaps', () => {
	it('maps every catalogue field of every entity scope, end keys included', () => {
		for (const def of FIELDS) {
			if (def.scope === 'project') continue;
			expect(fieldMap(def.scope, def.key), `${def.scope}.${def.key}`).toBeDefined();
			if ('end' in def && def.end) expect(fieldMap(def.scope, endKey(def.key)), `${def.scope}.${def.key} end`).toBeDefined();
		}
	});

	it('maps every key the store links records by', () => {
		for (const scope of ENTITY_SCOPES) {
			for (const link of linkKeys(scope)) expect(fieldMap(scope, link.key), `${scope}.${link.key}`).toMatchObject({ kind: 'ref' });
		}
	});

	it('has no project scope: the project is not ours to write', () => {
		expect(ENTITY_SCOPES).not.toContain('project');
	});

	it('derives the FPT data type from the value type', () => {
		expect(fieldMap('take', 'focalLength')!.columns).toEqual([
			expect.objectContaining({ name: 'sg_focal_length', display: 'Focal Length', dataType: 'float' })
		]);
		expect(fieldMap('take', 'isoSpeed')!.columns[0]).toMatchObject({ name: 'sg_iso', dataType: 'number' });
		expect(fieldMap('take', 'circleTake')!.columns[0]).toMatchObject({ name: 'sg_circled', dataType: 'checkbox' });
		expect(fieldMap('take', 'startedAt')!.columns[0]).toMatchObject({ name: 'sg_start_time', dataType: 'date_time' });
		expect(fieldMap('shootDay', 'shootDate')!.columns[0]).toMatchObject({ name: 'sg_shoot_date', dataType: 'date' });
		expect(fieldMap('take', 'timecodeStart')!.columns[0]).toMatchObject({ dataType: 'text' });
		expect(fieldMap('slate', 'scriptTime')!.columns[0]).toMatchObject({ dataType: 'text' });
		expect(fieldMap('slate', 'vfxShots')!.columns[0]).toMatchObject({ name: 'sg_vfx_shots', dataType: 'text' });
	});

	it('stores a length as a number of metres, named with its unit', () => {
		expect(fieldMap('take', 'focusDistance')).toMatchObject({
			kind: 'length',
			infinity: true,
			columns: [{ name: 'sg_focus_distance_m', display: 'Focus Distance m', dataType: 'float' }]
		});
	});

	it('stores a rational as text, which loses nothing', () => {
		expect(fieldMap('take', 'captureFrameRate')).toMatchObject({ kind: 'rational', columns: [{ dataType: 'text' }] });
		expect(fieldMap('lens', 'anamorphicSqueeze')).toMatchObject({ kind: 'rational', columns: [{ dataType: 'text' }] });
	});

	it('gives a start and end pair two fields', () => {
		expect(fieldMap('take', 'tilt')!.columns[0].name).toBe('sg_tilt');
		expect(fieldMap('take', 'tiltEnd')!.columns[0]).toMatchObject({ name: 'sg_tilt_end', display: 'Tilt End', dataType: 'float' });
		expect(fieldMap('take', 'lensHeightEnd')!.columns[0]).toMatchObject({ name: 'sg_lens_height_end_m', display: 'Lens Height End m' });
		expect(fieldMap('take', 'tStopEnd')).toBeUndefined();
	});

	it('gives dimensions a width and a height field', () => {
		expect(fieldMap('camera', 'activeSensorPhysicalDimensions')!.columns).toEqual([
			expect.objectContaining({ name: 'sg_sensor_width_mm', dataType: 'float' }),
			expect.objectContaining({ name: 'sg_sensor_height_mm', dataType: 'float' })
		]);
		expect(fieldMap('camera', 'activeSensorResolution')!.columns.map((c) => c.dataType)).toEqual(['number', 'number']);
	});

	it('puts the name of each record in the stock code field', () => {
		const code = { name: 'code', stock: true };
		expect(fieldMap('slate', 'slateUID')!.columns[0]).toMatchObject(code);
		expect(fieldMap('take', 'take')!.columns[0]).toMatchObject(code);
		expect(fieldMap('camera', 'cameraModel')!.columns[0]).toMatchObject(code);
		expect(fieldMap('lens', 'lensModel')!.columns[0]).toMatchObject(code);
		expect(fieldMap('cameraSetup', 'cameraLabel')!.columns[0]).toMatchObject(code);
		expect(fieldMap('lightingSetup', 'label')!.columns[0]).toMatchObject(code);
		expect(fieldMap('slate', 'description')!.columns[0]).toMatchObject({ name: 'description', stock: true });
	});

	it('names a shoot day by its date as well', () => {
		expect(fieldMap('shootDay', 'shootDate')).toMatchObject({ alsoCode: true });
	});

	it('keeps notes off the stock notes field, which links Note records', () => {
		for (const scope of ['lightingSetup', 'slate', 'take'] as const) {
			expect(fieldMap(scope, 'notes')!.columns[0]).toMatchObject({ name: 'sg_set_notes', dataType: 'text' });
		}
	});

	it('links records with entity fields', () => {
		expect(fieldMap('shootDay', 'projectId')!.columns[0]).toMatchObject({ name: 'project', stock: true, target: 'project' });
		expect(fieldMap('slate', 'shootDayId')!.columns[0]).toMatchObject({ name: 'sg_shoot_day', dataType: 'entity', target: 'shootDay' });
		expect(fieldMap('take', 'slateId')!.columns[0]).toMatchObject({ name: 'sg_slate', dataType: 'entity', target: 'slate' });
		expect(fieldMap('take', 'cameraSetupId')!.columns[0]).toMatchObject({ name: 'sg_camera_setup', target: 'cameraSetup' });
		expect(fieldMap('cameraSetup', 'lensId')!.columns[0]).toMatchObject({ name: 'sg_lens', target: 'lens' });
		expect(fieldMap('slate', 'lightingSetupId')!.columns[0]).toMatchObject({ name: 'sg_lighting_setup', target: 'lightingSetup' });
	});

	it('keeps the template link, as text', () => {
		expect(fieldMap('take', 'templateId')).toMatchObject({ kind: 'text', columns: [{ name: 'sg_onset_template', dataType: 'text' }] });
		expect(fieldMap('slate', 'templateId')).toBeDefined();
		expect(fieldMap('camera', 'templateId')).toBeUndefined();
	});

	it('never maps two keys of a scope to one field', () => {
		for (const scope of ENTITY_SCOPES) {
			const all = fieldMaps(scope).flatMap((m) => m.columns.map((c) => c.name));
			expect(new Set(all).size, scope).toBe(all.length);
		}
	});

	it('names every field so the server derives the name we expect, in ASCII', () => {
		for (const scope of ENTITY_SCOPES) {
			for (const column of wantedColumns(scope)) {
				expect(codeName(column.display), `${scope} ${column.display}`).toBe(column.name);
				expect(column.display).toMatch(/^[\x20-\x7e]+$/);
			}
		}
	});
});

describe('wantedColumns', () => {
	it('asks for the client UUID on every entity, unique', () => {
		for (const scope of ENTITY_SCOPES) expect(wantedColumns(scope)).toContainEqual(UUID);
		expect(UUID).toMatchObject({ name: 'sg_onset_uuid', dataType: 'text', unique: true });
	});

	it('asks for the stills field on the take only', () => {
		expect(STILLS).toMatchObject({ name: 'sg_photos', dataType: 'multi_entity', target: 'attachment' });
		expect(names('take')).toContain('sg_photos');
		expect(names('slate')).not.toContain('sg_photos');
	});

	it('leaves out the stock fields', () => {
		for (const scope of ENTITY_SCOPES) {
			expect(names(scope)).not.toContain('code');
			expect(names(scope)).not.toContain('project');
			expect(names(scope)).not.toContain('description');
		}
	});

	it('lists what a camera setup needs', () => {
		expect(names('cameraSetup').sort()).toEqual(['sg_camera', 'sg_lens', 'sg_onset_uuid']);
	});
});

describe('ENTITY_TYPES', () => {
	it('names the three built-in types and the four display names to find', () => {
		expect(ENTITY_TYPES).toEqual({
			shootDay: { kind: 'builtin', entityType: 'ShootDay', displayName: 'Shoot Day' },
			slate: { kind: 'builtin', entityType: 'Slate', displayName: 'Slate' },
			camera: { kind: 'builtin', entityType: 'Camera', displayName: 'Camera' },
			take: { kind: 'custom', displayName: 'Take' },
			lens: { kind: 'custom', displayName: 'Lens', aliases: ['Lenses'] },
			cameraSetup: { kind: 'custom', displayName: 'Camera Setup' },
			lightingSetup: { kind: 'custom', displayName: 'Lighting Setup' }
		});
	});
});

describe('mappingTable', () => {
	it('has a row per mapped key, for the README', () => {
		const rows = mappingTable();
		expect(rows).toContainEqual({ scope: 'take', key: 'tilt', field: 'sg_tilt', dataType: 'float', note: 'deg' });
		expect(rows.length).toBe(ENTITY_SCOPES.reduce((n, s) => n + fieldMaps(s).length, 0));
	});
});
