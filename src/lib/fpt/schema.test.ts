import { describe, expect, it } from 'vitest';
import { ENTITY_SCOPES, wantedColumns, type EntityScope } from './mapping';
import {
	createInput,
	entityTypesOf,
	hasNotes,
	hasScope,
	parseResolution,
	planFields,
	resolveEntities,
	serializeResolution,
	toResolution,
	type RawFields,
	type SchemaTypes
} from './schema';
import { DEFAULT_NAMING, type Naming } from './naming';
import { completeFields as complete, noteFields, rawField as raw, TYPES, versionFields } from './testkit';

/** What a site holds on Version: its stock fields, and our client UUID once Set Up Fields ran. */
const VERSION_DONE = { version: versionFields(true) };

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
	CustomEntity21: type('Set Reference'),
	CustomEntity22: type('Set Shot'),
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

	// A site set up before the reference log: a studio enables one more slot, as for Take. Optional
	// (Kevin, #117): a site without it syncs the rest, and the references wait on the device.
	it('asks for a Set Reference entity, says it is optional, and gives the other types without it', () => {
		const { CustomEntity21: _ref, ...before } = SITE;
		expect(resolveEntities(before).find((e) => e.scope === 'reference')).toEqual({ scope: 'reference', kind: 'custom', displayName: 'Set Reference', status: 'missing', optional: true });
		const { reference: _type, ...rest } = TYPES;
		expect(entityTypesOf(resolveEntities(before))).toEqual(rest);
		expect(status('reference')).toMatchObject({ status: 'found', entityType: 'CustomEntity21', optional: true });
	});

	// Kevin, #102: one more slot, enabled and named by an admin as for Take (findings/122). Optional
	// (Kevin, #117): a site without it syncs the rest.
	it('asks for a Set Shot entity, says it is optional, and gives the other types without it', () => {
		const { CustomEntity22: _setShot, ...before } = SITE;
		expect(resolveEntities(before).find((e) => e.scope === 'setShot')).toEqual({ scope: 'setShot', kind: 'custom', displayName: 'Set Shot', status: 'missing', optional: true });
		const { setShot: _type, ...rest } = TYPES;
		expect(entityTypesOf(resolveEntities(before))).toEqual(rest);
		expect(status('setShot')).toMatchObject({ status: 'found', entityType: 'CustomEntity22', optional: true });
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

	it('reuses a Shots field of the site that links Shot, and steps aside from one that does not', () => {
		const fields = complete();
		fields.slate.sg_shots = raw('multi_entity', 'Shots', { validTypes: ['Shot'] });
		expect(one(plan(fields), 'slate', 'sg_shots')).toMatchObject({ status: 'present', name: 'sg_shots' });
		fields.slate.sg_shots = raw('text', 'Shots');
		expect(one(plan(fields), 'slate', 'sg_shots')).toMatchObject({ status: 'create', name: 'sg_onset_shots', displayName: 'Onset Shots', validTypes: ['Shot'] });
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

	// A multi_entity on a built-in source: `slate_<field>_slates` was measured on Slate
	// (findings/155), as `version_sg_ai_generated_from_versions` on Version
	// (findings/field_types/multi_entity.md), the slot form in findings/142.
	it('says the Shots link of the slate adds a field on Shot that lists the slates', () => {
		const fields = complete();
		delete fields.slate.sg_shots;
		const plans = planFields(TYPES, fields, { names: NAMES, others: { Shot: { code: raw('text', 'Shot Code') } } });
		expect(one(plans, 'slate', 'sg_shots')).toMatchObject({
			status: 'create',
			dataType: 'multi_entity',
			validTypes: ['Shot'],
			reverse: { entityType: 'Shot', name: 'slate_sg_shots_slates', displayName: 'Slates <-> Shots' }
		});
	});

	// Kevin, #102. A multi_entity on a slot adds `<slug>_<field>_<slug>s` on its target (findings/142).
	it('says the Set Shot links add a field on Set Shot that lists the slates, and one on Shot that lists the Set Shots', () => {
		const fields = complete();
		delete fields.slate.sg_set_shots;
		delete fields.setShot.sg_shots;
		const plans = planFields(TYPES, fields, { names: { ...NAMES, CustomEntity22: 'Set Shot' }, others: { Shot: { code: raw('text', 'Shot Code') } } });
		expect(one(plans, 'slate', 'sg_set_shots')).toMatchObject({
			status: 'create',
			validTypes: ['CustomEntity22'],
			reverse: { entityType: 'CustomEntity22', name: 'slate_sg_set_shots_slates', displayName: 'Slates <-> Set Shots' }
		});
		expect(one(plans, 'setShot', 'sg_shots')).toMatchObject({
			status: 'create',
			validTypes: ['Shot'],
			reverse: { entityType: 'Shot', name: 'custom_entity22_sg_shots_custom_entity22s', displayName: 'Set Shots <-> Shots' }
		});
	});

	it('plans no Set Shots link on the slate until the site has the Set Shot entity: it waits, blocking nothing', () => {
		const { setShot: _setShot, ...types } = TYPES;
		const fields = complete();
		delete fields.slate.sg_set_shots;
		expect(one(planFields(types, fields), 'slate', 'sg_set_shots')).toBeUndefined();
	});

	it('does not create the Shots link when Shot already has the name it would add', () => {
		const fields = complete();
		delete fields.slate.sg_shots;
		const plans = planFields(TYPES, fields, { names: NAMES, others: { Shot: { slate_sg_shots_slates: raw('text', 'x') } } });
		expect(one(plans, 'slate', 'sg_shots')).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Shot.slate_sg_shots_slates') });
	});

	it('finds a field of ours present with its reverse, and plans nothing', () => {
		const fields = complete();
		fields.slate.sg_takes = raw('multi_entity', 'Take <-> Slate', { validTypes: ['CustomEntity09'] });
		const plans = planFields(TYPES, fields, { names: NAMES });
		expect(one(plans, 'take', 'sg_slate')).toMatchObject({ status: 'present', reverse: { entityType: 'Slate', name: 'sg_takes' } });
	});
});

// Videos go up as Versions linked to their take (Kevin, 2026-11-17). Version is stock; only the
// client UUID is ours, created unique as on every entity (findings/127).
describe('planFields: Version', () => {
	const version = (plans: ReturnType<typeof planFields>) => plans.filter((p) => p.scope === 'version');

	it('plans the client UUID on Version, to create unique', () => {
		const [uuid] = version(planFields(TYPES, complete(), { version: versionFields(false) }));
		expect(uuid).toMatchObject({ entityType: 'Version', name: 'sg_onset_uuid', displayName: 'Onset UUID', dataType: 'text', status: 'create', unique: true });
		expect(createInput(uuid).properties).toMatchObject({ unique: true });
	});

	it('finds it present the next time', () => {
		expect(version(planFields(TYPES, complete(), VERSION_DONE))).toMatchObject([{ status: 'present', name: 'sg_onset_uuid' }]);
	});

	it('will not use a Version field of that name that is not unique', () => {
		const fields = versionFields(false);
		fields.sg_onset_uuid = raw('text', 'Onset UUID');
		expect(version(planFields(TYPES, complete(), { version: fields }))).toMatchObject([{ status: 'blocked' }]);
	});

	it('plans nothing on Version when its fields were not read', () => {
		expect(version(planFields(TYPES, complete()))).toEqual([]);
	});
});

// Notes on Shots (#97): one Note per Shot, found again by a key in a unique text field on Note
// (findings/146), and what it lists as ids beside it. Note is stock; both fields are ours, and
// optional: a site without them syncs the rest.
describe('planFields: Note', () => {
	const note = (plans: ReturnType<typeof planFields>) => plans.filter((p) => p.scope === 'note');

	it('plans the key, to create unique, and what the Note lists', () => {
		const [key, captured] = note(planFields(TYPES, complete(), { ...VERSION_DONE, note: noteFields(false) }));
		expect(key).toMatchObject({ entityType: 'Note', name: 'sg_onset_key', displayName: 'Onset Key', dataType: 'text', status: 'create', unique: true });
		expect(createInput(key).properties).toMatchObject({ unique: true });
		expect(captured).toMatchObject({ entityType: 'Note', name: 'sg_onset_captured', displayName: 'Onset Captured', dataType: 'text', status: 'create' });
		expect(captured.unique).toBeUndefined();
	});

	it('finds them present the next time', () => {
		expect(note(planFields(TYPES, complete(), { ...VERSION_DONE, note: noteFields(true) }))).toMatchObject([
			{ status: 'present', name: 'sg_onset_key' },
			{ status: 'present', name: 'sg_onset_captured' }
		]);
	});

	it('will not use a key of that name that is not unique', () => {
		const fields = noteFields(false);
		fields.sg_onset_key = raw('text', 'Onset Key');
		expect(note(planFields(TYPES, complete(), { note: fields }))[0]).toMatchObject({ status: 'blocked' });
	});

	it('plans nothing on Note when its fields were not read', () => {
		expect(note(planFields(TYPES, complete(), VERSION_DONE))).toEqual([]);
	});
});

describe('createInput', () => {
	const bare = { take: { code: raw('text', 'Take Name') }, slate: { code: raw('text', 'Slate Name') } };
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
		expect(input('sg_shots')).toMatchObject({ dataType: 'multi_entity', displayName: 'Shots', properties: { valid_types: ['Shot'] } });
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
		const res = toResolution('https://x.shotgrid.autodesk.com', resolveEntities(SITE), planFields(TYPES, fields, VERSION_DONE))!;
		expect(res.entities).toEqual(TYPES);
		expect(res.fields.lens.sg_focal_length).toBe('sg_onset_focal_length');
		expect(res.fields.take.sg_tilt).toBe('sg_tilt');
		expect(res.versionUuid).toBe('sg_onset_uuid');
		expect(res.site).toBe('https://x.shotgrid.autodesk.com');
	});

	it('is nothing while a field or an entity is missing', () => {
		const fields = complete();
		delete fields.take.sg_tilt;
		expect(toResolution('s', resolveEntities(SITE), planFields(TYPES, fields, VERSION_DONE))).toBeUndefined();
		const { Slate: _s, ...rest } = SITE;
		expect(toResolution('s', resolveEntities(rest), planFields(TYPES, complete(), VERSION_DONE))).toBeUndefined();
	});

	it("is nothing while Version lacks the client UUID, or Version's fields were not read", () => {
		expect(toResolution('s', resolveEntities(SITE), planFields(TYPES, complete(), { version: versionFields(false) }))).toBeUndefined();
		expect(toResolution('s', resolveEntities(SITE), planFields(TYPES, complete()))).toBeUndefined();
	});

	it('survives the cache, and only for its own site', () => {
		const res = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), VERSION_DONE))!;
		const text = serializeResolution(res);
		expect(parseResolution(text, 'https://a.example')).toEqual(res);
		expect(parseResolution(text, 'https://b.example')).toBeUndefined();
		expect(parseResolution('{not json', 'https://a.example')).toBeUndefined();
		expect(parseResolution(undefined, 'https://a.example')).toBeUndefined();
		expect(parseResolution(JSON.stringify({ ...res, version: 0 }), 'https://a.example')).toBeUndefined();
	});

	// Kevin, #117: Set Shot is optional. Until it and its fields are there, it is left out, with the
	// slate field that links it, and the rest is ready.
	it('leaves the Set Shot out while the site lacks it or one of its fields, and the rest is ready', () => {
		const { CustomEntity22: _slot, ...noSlot } = SITE;
		const { setShot: _type, ...types } = TYPES;
		const fields = complete();
		delete fields.slate.sg_set_shots;
		const res = toResolution('https://a.example', resolveEntities(noSlot), planFields(types, fields, VERSION_DONE))!;
		expect(res.entities.setShot).toBeUndefined();
		expect(res.fields.setShot).toBeUndefined();
		expect(res.fields.slate.sg_set_shots).toBeUndefined();
		expect(res.fields.slate.sg_shots).toBe('sg_shots');
		expect(parseResolution(serializeResolution(res), 'https://a.example')).toEqual(res);

		const half = complete();
		delete half.setShot.sg_onset_matched;
		const without = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, half, VERSION_DONE))!;
		expect(without.entities.setShot).toBeUndefined();
		expect(without.fields.slate.sg_set_shots).toBeUndefined();
	});

	it('is read again from a cache whose Set Shot lacks a field asked for since', () => {
		const res = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), VERSION_DONE))!;
		expect(res.fields.setShot?.sg_onset_matched).toBe('sg_onset_matched');
		const { sg_onset_matched: _m, ...older } = res.fields.setShot!;
		expect(parseResolution(JSON.stringify({ ...res, fields: { ...res.fields, setShot: older } }), 'https://a.example')).toBeUndefined();
	});

	// Kevin, #117: Set Reference is optional. Until it and every field of it are there, it is left
	// out, and the rest is ready.
	it('leaves the Set Reference out while the site lacks it or one of its fields, and the rest is ready', () => {
		const { CustomEntity21: _slot, ...noSlot } = SITE;
		const { reference: _type, ...types } = TYPES;
		const res = toResolution('https://a.example', resolveEntities(noSlot), planFields(types, complete(), VERSION_DONE))!;
		expect(res.entities.reference).toBeUndefined();
		expect(res.fields.reference).toBeUndefined();
		expect(res.entities.slate).toBe('Slate');
		expect(hasScope(res, 'reference')).toBe(false);
		expect(hasScope(res, 'setShot')).toBe(true);
		expect(parseResolution(serializeResolution(res), 'https://a.example')).toEqual(res);

		const half = complete();
		delete half.reference.sg_slates;
		const without = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, half, VERSION_DONE))!;
		expect(without.entities.reference).toBeUndefined();
		expect(without.fields.reference).toBeUndefined();
		expect(without.fields.take.sg_onset_uuid).toBe('sg_onset_uuid');

		const whole = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), VERSION_DONE))!;
		expect(whole.entities.reference).toBe('CustomEntity21');
		expect(whole.fields.reference?.sg_slates).toBe('sg_slates');
	});

	it('is read again from a cache whose Set Reference lacks a field asked for since', () => {
		const res = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), VERSION_DONE))!;
		const { sg_slates: _s, ...older } = res.fields.reference!;
		expect(parseResolution(JSON.stringify({ ...res, fields: { ...res.fields, reference: older } }), 'https://a.example')).toBeUndefined();
		// One with no Set Reference at all is good: the references wait for a check.
		const { reference: _e, ...entities } = res.entities;
		const { reference: _f, ...fields } = res.fields;
		const none = { ...res, entities, fields };
		expect(parseResolution(JSON.stringify(none), 'https://a.example')).toEqual(none);
	});

	// Notes on Shots (#97) is optional: without the Note fields the rest is ready and the Notes wait.
	it('holds the Note fields once both are there, and is ready without them', () => {
		const withNotes = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), { ...VERSION_DONE, note: noteFields(true) }))!;
		expect(withNotes.note).toEqual({ key: 'sg_onset_key', captured: 'sg_onset_captured' });
		expect(hasNotes(withNotes)).toBe(true);
		expect(parseResolution(serializeResolution(withNotes), 'https://a.example')).toEqual(withNotes);

		const half = noteFields(true);
		delete half.sg_onset_captured;
		const without = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), { ...VERSION_DONE, note: half }))!;
		expect(without.note).toBeUndefined();
		expect(hasNotes(without)).toBe(false);
		expect(toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), VERSION_DONE))?.note).toBeUndefined();
	});

	it('is read again from a cache whose Note fields are not names', () => {
		const res = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), { ...VERSION_DONE, note: noteFields(true) }))!;
		expect(parseResolution(JSON.stringify({ ...res, note: { key: 'sg_onset_key' } }), 'https://a.example')).toBeUndefined();
		// One written before Notes on Shots is still good: the Notes wait for a check.
		const { note: _n, ...before } = res;
		expect(parseResolution(JSON.stringify(before), 'https://a.example')).toEqual(before);
	});

	// A device that synced before videos went up as Versions holds a resolution without it: read again.
	it('is read again from a cache written before Versions', () => {
		const { versionUuid: _v, ...before } = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), VERSION_DONE))!;
		expect(parseResolution(JSON.stringify(before), 'https://a.example')).toBeUndefined();
	});
});

// #111: an admin picks the names. The default is the app's own; every test above runs on it.
describe('a naming', () => {
	const naming: Naming = {
		entities: { take: 'Shot Take', setShot: 'Shot Code' },
		fields: {
			'take.sg_focal_length': { display: 'Studio Focal Length' },
			'take.sg_circled': { field: 'sg_circle' },
			'take.sg_photos': { display: 'Stills' },
			'note.sg_onset_key': { display: 'Studio Key' }
		}
	};
	const site: SchemaTypes = { ...SITE, CustomEntity09: type('Shot Take'), CustomEntity22: type('Shot Code') };
	const one = (plans: ReturnType<typeof planFields>, scope: string, column: string) => plans.find((p) => p.scope === scope && p.column.name === column)!;
	/** A site where the fields chosen are there. */
	const named = (): Partial<Record<EntityScope, RawFields>> => {
		const fields = complete();
		fields.take.sg_studio_focal_length = raw('float', 'Studio Focal Length');
		fields.take.sg_circle = raw('checkbox', 'Circle');
		fields.take.sg_stills = raw('multi_entity', 'Stills', { validTypes: ['Attachment'] });
		return fields;
	};
	const note = () => ({ ...noteFields(true), sg_studio_key: raw('text', 'Studio Key', { unique: true }) });

	it('finds each custom entity under its chosen name alone, and says that name', () => {
		expect(entityTypesOf(resolveEntities(site, naming))).toEqual(TYPES);
		expect(resolveEntities(site, naming).find((e) => e.scope === 'take')).toMatchObject({ displayName: 'Shot Take', status: 'found', entityType: 'CustomEntity09' });
		// Named Shot Take, an entity called Take is not it.
		expect(resolveEntities(SITE, naming).find((e) => e.scope === 'take')).toEqual({ scope: 'take', kind: 'custom', displayName: 'Shot Take', status: 'missing' });
		expect(resolveEntities(SITE, naming).find((e) => e.scope === 'setShot')).toMatchObject({ displayName: 'Shot Code', status: 'missing', optional: true });
	});

	it('plans a renamed field under its name, and steps aside from it as from the default', () => {
		const fields = complete();
		fields.take = { code: raw('text', 'Take Name') };
		const plans = planFields(TYPES, fields, {}, naming);
		expect(one(plans, 'take', 'sg_focal_length')).toMatchObject({ status: 'create', name: 'sg_studio_focal_length', displayName: 'Studio Focal Length', dataType: 'float' });
		expect(one(plans, 'take', 'sg_tilt')).toMatchObject({ status: 'create', name: 'sg_tilt', displayName: 'Tilt' });
		fields.take.sg_studio_focal_length = raw('text', 'Studio Focal Length');
		expect(one(planFields(TYPES, fields, {}, naming), 'take', 'sg_focal_length')).toMatchObject({ status: 'create', name: 'sg_onset_studio_focal_length', displayName: 'Onset Studio Focal Length' });
		fields.take.sg_studio_focal_length = raw('float', 'Lens mm');
		expect(one(planFields(TYPES, fields, {}, naming), 'take', 'sg_focal_length')).toMatchObject({ status: 'present', name: 'sg_studio_focal_length', displayName: 'Lens mm' });
	});

	it('uses a field mapped to one the site has, and never creates it', () => {
		const fields = complete();
		delete fields.take.sg_circled;
		expect(one(planFields(TYPES, fields, {}, naming), 'take', 'sg_circled')).toMatchObject({ status: 'blocked', name: 'sg_circle', reason: 'CustomEntity09.sg_circle is not on the site' });
		fields.take.sg_circle = raw('text', 'Circle');
		expect(one(planFields(TYPES, fields, {}, naming), 'take', 'sg_circled')).toMatchObject({ status: 'blocked', name: 'sg_circle', reason: 'CustomEntity09.sg_circle is a text field, not checkbox' });
		fields.take.sg_circle = raw('checkbox', 'Circle');
		expect(one(planFields(TYPES, fields, {}, naming), 'take', 'sg_circled')).toMatchObject({ status: 'present', name: 'sg_circle', displayName: 'Circle' });
	});

	it('names the field a renamed link adds from its new name and the entity’s', () => {
		const fields = complete();
		delete fields.take.sg_photos;
		expect(one(planFields(TYPES, fields, { names: { CustomEntity09: 'Shot Take' } }, naming), 'take', 'sg_photos').reverse).toEqual({
			entityType: 'Attachment',
			name: 'custom_entity09_sg_stills_custom_entity09s',
			displayName: 'Shot Takes <-> Stills'
		});
	});

	it('names the chosen entity a link waits for', () => {
		const types: Partial<Record<EntityScope, string>> = { ...TYPES };
		delete types.lens;
		const fields = complete();
		delete fields.take.sg_lens;
		expect(one(planFields(types, fields, {}, { entities: { lens: 'Glass' } }), 'take', 'sg_lens')).toMatchObject({ status: 'blocked', reason: 'links Glass, which the site does not have yet' });
	});

	it('plans the Version and Note fields under their chosen names', () => {
		const plans = planFields(TYPES, complete(), { version: versionFields(true), note: noteFields(false) }, naming);
		expect(one(plans, 'note', 'sg_onset_key')).toMatchObject({ status: 'create', name: 'sg_studio_key', displayName: 'Studio Key', unique: true });
		expect(one(plans, 'note', 'sg_onset_captured')).toMatchObject({ status: 'create', name: 'sg_onset_captured' });
	});

	it('makes a resolution keyed by the default names, holding the chosen ones and the naming', () => {
		const res = toResolution('https://a.example', resolveEntities(site, naming), planFields(TYPES, named(), { version: versionFields(true), note: note() }, naming), naming)!;
		expect(res.entities.take).toBe('CustomEntity09');
		expect(res.fields.take.sg_focal_length).toBe('sg_studio_focal_length');
		expect(res.fields.take.sg_circled).toBe('sg_circle');
		expect(res.fields.take.sg_photos).toBe('sg_stills');
		expect(res.fields.take.sg_tilt).toBe('sg_tilt');
		expect(res.note).toEqual({ key: 'sg_studio_key', captured: 'sg_onset_captured' });
		expect(res.naming).toEqual(naming);
	});

	it('keeps no naming in a resolution of the default names, as before', () => {
		const res = toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), VERSION_DONE), DEFAULT_NAMING)!;
		expect('naming' in res).toBe(false);
	});

	it('survives the cache with its naming; asked for another naming, it is read again', () => {
		const res = toResolution('https://a.example', resolveEntities(site, naming), planFields(TYPES, named(), VERSION_DONE, naming), naming)!;
		const text = serializeResolution(res);
		expect(parseResolution(text, 'https://a.example')).toEqual(res);
		expect(parseResolution(text, 'https://a.example', naming)).toEqual(res);
		expect(parseResolution(text, 'https://a.example', DEFAULT_NAMING)).toBeUndefined();
		const plain = serializeResolution(toResolution('https://a.example', resolveEntities(SITE), planFields(TYPES, complete(), VERSION_DONE))!);
		expect(parseResolution(plain, 'https://a.example', DEFAULT_NAMING)).toBeDefined();
		expect(parseResolution(plain, 'https://a.example', naming)).toBeUndefined();
		expect(parseResolution(JSON.stringify({ ...res, naming: { entities: { slate: 'Plate' } } }), 'https://a.example')).toBeUndefined();
	});
});
