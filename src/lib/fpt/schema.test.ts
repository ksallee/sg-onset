import { describe, expect, it } from 'vitest';
import { ENTITY_SCOPES, wantedColumns, type EntityScope } from './mapping';
import {
	createInput,
	entityTypesOf,
	parseResolution,
	planFields,
	resolveEntities,
	serializeResolution,
	toResolution,
	type RawFields,
	type SchemaTypes
} from './schema';
import { completeFields as complete, rawField as raw, TYPES } from './testkit';

// Shapes: corpus endpoints/get_schema.md and endpoints/get_schema_type_fields.md. Slot numbers
// differ per site (findings/008_custom_entities.md); these are the probed site's, read 2026-11-11.
const type = (display: string) => ({ name: { value: display, editable: false }, visible: { value: true, editable: false } });
const SITE: SchemaTypes = {
	ShootDay: type('Shoot Day'),
	Slate: type('Slate'),
	Camera: type('Camera'),
	MocapTake: type('Mocap Take'),
	CustomEntity09: type('Take'),
	CustomEntity10: type('Camera Setup'),
	CustomEntity11: type('Lighting Setup'),
	CustomEntity19: type('Lens'),
	CustomEntity29: type('Location'),
	CustomEntity29_sg_scene_Connection: type('Custom Entity29 Sg Scene Connection')
};
const status = (scope: EntityScope) => resolveEntities(SITE).find((e) => e.scope === scope);

describe('resolveEntities', () => {
	it('finds the built-in types by schema name and the custom ones by display name', () => {
		expect(entityTypesOf(resolveEntities(SITE))).toEqual(TYPES);
		expect(status('take')).toEqual({ scope: 'take', kind: 'custom', displayName: 'Take', status: 'found', entityType: 'CustomEntity09' });
		expect(status('shootDay')).toEqual({ scope: 'shootDay', kind: 'builtin', displayName: 'Shoot Day', status: 'found', entityType: 'ShootDay' });
	});

	it('never goes by slot number', () => {
		const moved: SchemaTypes = { ...SITE, CustomEntity09: type('Sound Roll'), CustomEntity42: type('Take') };
		expect(entityTypesOf(resolveEntities(moved))?.take).toBe('CustomEntity42');
	});

	// findings/008: display names are free text and may hold a trailing space.
	it('matches a display name trimmed and whatever its case', () => {
		const loose: SchemaTypes = { ...SITE, CustomEntity09: type('take '), CustomEntity10: type(' CAMERA SETUP') };
		expect(entityTypesOf(resolveEntities(loose))).toMatchObject({ take: 'CustomEntity09', cameraSetup: 'CustomEntity10' });
	});

	it('takes Lenses for the lens entity', () => {
		const plural: SchemaTypes = { ...SITE, CustomEntity19: type('Lenses') };
		expect(resolveEntities(plural).find((e) => e.scope === 'lens')).toMatchObject({ status: 'found', entityType: 'CustomEntity19', displayName: 'Lens' });
	});

	it('says which custom entity to enable and what to name it', () => {
		const { CustomEntity09: _take, ...rest } = SITE;
		expect(resolveEntities(rest).find((e) => e.scope === 'take')).toEqual({ scope: 'take', kind: 'custom', displayName: 'Take', status: 'missing' });
	});

	// findings/122: a hidden built-in type is absent from /schema.
	it('says which built-in type is switched off', () => {
		const { Slate: _slate, ...rest } = SITE;
		expect(resolveEntities(rest).find((e) => e.scope === 'slate')).toEqual({
			scope: 'slate',
			kind: 'builtin',
			displayName: 'Slate',
			status: 'missing',
			entityType: 'Slate'
		});
	});

	it('reports two custom entities with one display name as ambiguous, with both', () => {
		const twice: SchemaTypes = { ...SITE, CustomEntity31: type('Take') };
		expect(resolveEntities(twice).find((e) => e.scope === 'take')).toEqual({
			scope: 'take',
			kind: 'custom',
			displayName: 'Take',
			status: 'ambiguous',
			candidates: ['CustomEntity09', 'CustomEntity31']
		});
		const both: SchemaTypes = { ...SITE, CustomEntity31: type('Lenses') };
		expect(resolveEntities(both).find((e) => e.scope === 'lens')).toMatchObject({ status: 'ambiguous', candidates: ['CustomEntity19', 'CustomEntity31'] });
	});

	it('ignores connection types and built-in types that share a display name', () => {
		const noise: SchemaTypes = { ...SITE, CustomEntity09_sg_takes_Connection: type('Take'), Performer: type('Take') };
		expect(resolveEntities(noise).find((e) => e.scope === 'take')).toMatchObject({ status: 'found', entityType: 'CustomEntity09' });
	});

	it('gives no types when one is missing', () => {
		const { Camera: _camera, ...rest } = SITE;
		expect(entityTypesOf(resolveEntities(rest))).toBeUndefined();
	});
});

describe('planFields', () => {
	const plan = (fields: Partial<Record<EntityScope, RawFields>>, types: Partial<Record<EntityScope, string>> = TYPES) => planFields(types, fields);
	const one = (plans: ReturnType<typeof planFields>, scope: EntityScope, column: string) => plans.find((p) => p.scope === scope && p.column.name === column)!;

	it('finds every field present on a complete site', () => {
		const plans = plan(complete());
		expect(plans.every((p) => p.status === 'present')).toBe(true);
		expect(plans.length).toBe(ENTITY_SCOPES.reduce((n, s) => n + wantedColumns(s).length, 0));
	});

	it('plans to create what a bare entity lacks', () => {
		const bare = complete();
		bare.take = { code: raw('text', 'Take Name') };
		const plans = plan(bare);
		expect(one(plans, 'take', 'sg_focal_length')).toMatchObject({ status: 'create', name: 'sg_focal_length', displayName: 'Focal Length', dataType: 'float', entityType: 'CustomEntity09' });
		expect(one(plans, 'take', 'sg_onset_uuid')).toMatchObject({ status: 'create', unique: true });
		expect(one(plans, 'take', 'sg_slate')).toMatchObject({ status: 'create', dataType: 'entity', validTypes: ['Slate'] });
		expect(one(plans, 'take', 'sg_photos')).toMatchObject({ status: 'create', dataType: 'multi_entity', validTypes: ['Attachment'] });
		expect(one(plans, 'slate', 'sg_shoot_day')).toMatchObject({ status: 'present' });
	});

	it('reuses a site field of the same name and type', () => {
		const fields = complete();
		fields.lens.sg_lens_serial_number = raw('text', 'Lens Serial Number');
		expect(one(plan(fields), 'lens', 'sg_lens_serial_number')).toMatchObject({ status: 'present', name: 'sg_lens_serial_number' });
	});

	// The probed site: Lens.sg_focal_length is text, ShootDay.sg_location links another entity.
	it('steps aside to an Onset name when the plain name holds another type', () => {
		const fields = complete();
		fields.lens.sg_focal_length = raw('text', 'Focal Length');
		fields.shootDay.sg_location = raw('entity', 'Location', { validTypes: ['CustomEntity29'] });
		const plans = plan(fields);
		expect(one(plans, 'lens', 'sg_focal_length')).toMatchObject({
			status: 'create',
			name: 'sg_onset_focal_length',
			displayName: 'Onset Focal Length',
			reason: expect.stringContaining('sg_focal_length')
		});
		expect(one(plans, 'shootDay', 'sg_location')).toMatchObject({ status: 'create', name: 'sg_onset_location' });
	});

	it('finds the Onset field once it exists', () => {
		const fields = complete();
		fields.lens.sg_focal_length = raw('text', 'Focal Length');
		fields.lens.sg_onset_focal_length = raw('float', 'Onset Focal Length');
		expect(one(plan(fields), 'lens', 'sg_focal_length')).toMatchObject({ status: 'present', name: 'sg_onset_focal_length' });
	});

	// endpoints/post_schema_type_fields.md: a display name in use is a 201 for `<name>_1`.
	it('steps aside when another field already shows the display name', () => {
		const fields = complete();
		fields.take.sg_tilt_old = raw('float', 'Tilt');
		delete fields.take.sg_tilt;
		expect(one(plan(fields), 'take', 'sg_tilt')).toMatchObject({ status: 'create', name: 'sg_onset_tilt', displayName: 'Onset Tilt' });
	});

	it('does not reuse an entity field that links another type', () => {
		const fields = complete();
		fields.take.sg_slate = raw('entity', 'Slate', { validTypes: ['Scene'] });
		expect(one(plan(fields), 'take', 'sg_slate')).toMatchObject({ status: 'create', name: 'sg_onset_slate', validTypes: ['Slate'] });
	});

	it('reuses an entity field that links our type among others', () => {
		const fields = complete();
		fields.take.sg_slate = raw('entity', 'Slate', { validTypes: ['Scene', 'Slate'] });
		expect(one(plan(fields), 'take', 'sg_slate')).toMatchObject({ status: 'present', name: 'sg_slate' });
	});

	// findings/116: `unique` is accepted at create and nowhere else.
	it('is blocked by a client UUID field that is not unique', () => {
		const fields = complete();
		fields.take.sg_onset_uuid = raw('text', 'Onset UUID');
		expect(one(plan(fields), 'take', 'sg_onset_uuid')).toMatchObject({ status: 'blocked', reason: expect.stringContaining('unique') });
	});

	it('is blocked when both names are taken', () => {
		const fields = complete();
		fields.take.sg_tilt = raw('text', 'Tilt');
		fields.take.sg_onset_tilt = raw('text', 'Onset Tilt');
		expect(one(plan(fields), 'take', 'sg_tilt')).toMatchObject({ status: 'blocked' });
	});

	it('does not reuse a field the person cannot write', () => {
		const fields = complete();
		fields.take.sg_tilt = raw('float', 'Tilt', { editable: false });
		expect(one(plan(fields), 'take', 'sg_tilt').status).not.toBe('present');
	});

	it('cannot plan a link to an entity that is missing', () => {
		const { lens: _lens, ...types } = TYPES;
		const { lens: _fields, ...fields } = complete();
		delete fields.cameraSetup.sg_lens;
		const plans = plan(fields, types);
		expect(one(plans, 'cameraSetup', 'sg_lens')).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Lens') });
		expect(plans.some((p) => p.scope === 'lens')).toBe(false);
	});
});

// corpus findings/142_reverse_field.md: every link field makes a field on the type it links.
describe('planFields: reverse fields', () => {
	const NAMES = { CustomEntity09: 'Take', CustomEntity10: 'Camera Setup', Slate: 'Slate', ShootDay: 'Shoot Day' };
	const one = (plans: ReturnType<typeof planFields>, scope: EntityScope, column: string) => plans.find((p) => p.scope === scope && p.column.name === column)!;
	const withoutTakeLinks = () => {
		const fields = complete();
		delete fields.take.sg_slate;
		delete fields.take.sg_photos;
		return fields;
	};

	it('says which field each link create will add, and where', () => {
		const plans = planFields(TYPES, withoutTakeLinks(), { names: NAMES, others: { Attachment: {} } });
		expect(one(plans, 'take', 'sg_slate').reverse).toEqual({ entityType: 'Slate', name: 'sg_takes', displayName: 'Take <-> Slate' });
		expect(one(plans, 'take', 'sg_photos').reverse).toEqual({ entityType: 'Attachment', name: 'custom_entity09_sg_photos_custom_entity09s', displayName: 'Takes <-> Photos' });
		expect(one(plans, 'take', 'sg_focal_length').reverse).toBeUndefined();
	});

	it('names it after what the site calls the source entity', () => {
		const plans = planFields(TYPES, withoutTakeLinks(), { names: { ...NAMES, CustomEntity09: 'Shot Take' } });
		expect(one(plans, 'take', 'sg_slate').reverse?.name).toBe('sg_shot_takes');
	});

	it('does not create a link whose added field would take a name the linked type already has', () => {
		const fields = withoutTakeLinks();
		fields.slate.sg_takes = raw('number', 'Takes');
		const plans = planFields(TYPES, fields, { names: NAMES, others: { Attachment: { custom_entity09_sg_photos_custom_entity09s: raw('text', 'x') } } });
		expect(one(plans, 'take', 'sg_slate')).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Slate.sg_takes') });
		expect(one(plans, 'take', 'sg_photos')).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Attachment.custom_entity09_sg_photos_custom_entity09s') });
	});

	it('does not let two creates of ours add the same name to one type', () => {
		const fields = withoutTakeLinks();
		delete fields.cameraSetup.sg_camera;
		// The site calls both entities "Take": each link to Camera would add `sg_takes` there.
		const plans = planFields(TYPES, fields, { names: { ...NAMES, CustomEntity10: 'Take' } });
		delete fields.take.sg_camera;
		const again = planFields(TYPES, fields, { names: { ...NAMES, CustomEntity10: 'Take' } });
		expect(one(plans, 'cameraSetup', 'sg_camera').status).toBe('create');
		expect([one(again, 'cameraSetup', 'sg_camera').status, one(again, 'take', 'sg_camera').status].sort()).toEqual(['blocked', 'create']);
	});

	it('finds a field of ours present with its reverse, and plans nothing', () => {
		const fields = complete();
		fields.slate.sg_takes = raw('multi_entity', 'Take <-> Slate', { validTypes: ['CustomEntity09'] });
		const plans = planFields(TYPES, fields, { names: NAMES });
		expect(one(plans, 'take', 'sg_slate')).toMatchObject({ status: 'present', reverse: { entityType: 'Slate', name: 'sg_takes' } });
	});
});

describe('createInput', () => {
	const bare = { take: { code: raw('text', 'Take Name') } };
	const plans = planFields(TYPES, bare);
	const input = (column: string) => createInput(plans.find((p) => p.column.name === column)!);

	// endpoints/post_schema_type_fields.md and findings/116_field_settings_create_update.md.
	it('sends the display name, and unique for the client UUID', () => {
		expect(input('sg_onset_uuid')).toEqual({
			dataType: 'text',
			displayName: 'Onset UUID',
			properties: { unique: true, description: expect.any(String) }
		});
	});

	it('sends valid_types for an entity field, exactly one for a multi-entity', () => {
		expect(input('sg_slate')).toMatchObject({ dataType: 'entity', properties: { valid_types: ['Slate'] } });
		expect(input('sg_photos')).toMatchObject({ dataType: 'multi_entity', properties: { valid_types: ['Attachment'] } });
	});

	// A bare checkbox create is a 500 (endpoints/post_schema_type_fields.md).
	it('sends a default for a checkbox', () => {
		expect(input('sg_circled')).toMatchObject({ dataType: 'checkbox', properties: { default_value: false } });
	});

	it('says the unit in the description', () => {
		expect(input('sg_focus_distance_m').properties.description).toMatch(/metres/i);
	});
});

describe('toResolution', () => {
	it('is the entity types and the real name of every field, once all is there', () => {
		const fields = complete();
		fields.lens.sg_focal_length = raw('text', 'Focal Length');
		fields.lens.sg_onset_focal_length = raw('float', 'Onset Focal Length');
		const res = toResolution('https://x.shotgrid.autodesk.com', resolveEntities(SITE), planFields(TYPES, fields))!;
		expect(res.entities).toEqual(TYPES);
		expect(res.fields.lens.sg_focal_length).toBe('sg_onset_focal_length');
		expect(res.fields.take.sg_tilt).toBe('sg_tilt');
		expect(res.site).toBe('https://x.shotgrid.autodesk.com');
	});

	it('is nothing while a field or an entity is missing', () => {
		const fields = complete();
		delete fields.take.sg_tilt;
		expect(toResolution('s', resolveEntities(SITE), planFields(TYPES, fields))).toBeUndefined();
		const { Slate: _s, ...rest } = SITE;
		expect(toResolution('s', resolveEntities(rest), planFields(TYPES, complete()))).toBeUndefined();
	});

	it('survives the cache, and only for its own site', () => {
		const res = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete()))!;
		const text = serializeResolution(res);
		expect(parseResolution(text, 'https://a.example')).toEqual(res);
		expect(parseResolution(text, 'https://b.example')).toBeUndefined();
		expect(parseResolution('{not json', 'https://a.example')).toBeUndefined();
		expect(parseResolution(undefined, 'https://a.example')).toBeUndefined();
		expect(parseResolution(JSON.stringify({ ...res, version: 0 }), 'https://a.example')).toBeUndefined();
	});
});
