import { describe, expect, it } from 'vitest';
import { TransportError } from '$lib/outbox/transport';
import { memoryKeyValue, resolutionKey } from './cache';
import { BEARER, fakeFpt, type FakeFpt } from './fakeFpt';
import { ENTITY_SCOPES, VERSION_COLUMNS, wantedColumns } from './mapping';
import { parseResolution } from './schema';
import { checkSetup, type SetupReport } from './setup';
import { rawField, TYPES } from './testkit';

function world(fields: 'complete' | 'bare' = 'complete') {
	const fpt = fakeFpt({ fields });
	const cache = memoryKeyValue();
	const check = (extra: { createFields?: boolean } = {}) =>
		checkSetup({ site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: cache, online: () => fpt.online, ...extra });
	return { fpt, cache, check };
}

const creates = (fpt: FakeFpt) => fpt.requests.filter((r) => r.method === 'POST' && r.path.includes('/schema/'));
const field = (report: SetupReport, scope: string, name: string) => report.fields.find((f) => f.scope === scope && f.name === name)!;
/** Every field of ours: on the eight entities, and the client UUID on Version, where videos go. */
const WANTED = ENTITY_SCOPES.reduce((n, s) => n + wantedColumns(s).length, 0) + VERSION_COLUMNS.length;

describe('checkSetup', () => {
	it('finds a site that is ready, and changes nothing on it', async () => {
		const { fpt, cache, check } = world();
		const report = await check();
		expect(report.ready).toBe(true);
		expect(report.site).toBe(fpt.site);
		expect(report.entities.map((e) => [e.scope, e.status, e.entityType])).toEqual(ENTITY_SCOPES.map((s) => [s, 'found', TYPES[s]]));
		expect(report.fields.length).toBe(WANTED);
		expect(report.fields.every((f) => f.status === 'present')).toBe(true);
		expect(fpt.requests.every((r) => r.method === 'GET')).toBe(true);
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.entities).toEqual(TYPES);
	});

	// corpus endpoints/get_schema.md: /schema is cheap and /fields is not. One read per type.
	it('reads the type list once and the fields of each of the nine types, Attachment, Shot and Version once', async () => {
		const { fpt, check } = world();
		await check();
		expect(fpt.requests.map((r) => r.path).sort()).toEqual(
			['/api/v1/schema', ...[...Object.values(TYPES), 'Attachment', 'Shot', 'Version'].map((t) => `/api/v1/schema/${t}/fields`)].sort()
		);
	});

	// Videos go up as Versions linked to their take (Kevin, 2026-11-17): a create sent twice must
	// be refused there too (findings/127).
	it('creates the client UUID on Version, unique, and the transport may use it', async () => {
		const { fpt, cache, check } = world('bare');
		const report = await check();
		expect(field(report, 'version', 'sg_onset_uuid')).toMatchObject({ entityType: 'Version', status: 'created', unique: true });
		expect(fpt.fields.Version.sg_onset_uuid.unique?.value).toBe(true);
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.versionUuid).toBe('sg_onset_uuid');
	});

	it('is not ready while Version lacks it, and says so', async () => {
		const { fpt, check } = world('bare');
		const report = await check({ createFields: false });
		expect(field(report, 'version', 'sg_onset_uuid')).toMatchObject({ entityType: 'Version', status: 'missing' });
		expect(fpt.fields.Version.sg_onset_uuid).toBeUndefined();
	});

	it('creates its fields on a bare site, each with what only a create can set', async () => {
		const { fpt, check } = world('bare');
		const report = await check();
		expect(report.ready).toBe(true);
		expect(report.canCreateFields).toBe(true);
		expect(report.fields.every((f) => f.status === 'created')).toBe(true);
		expect(creates(fpt).length).toBe(WANTED);
		// corpus findings/127 and 116: unique is set at create, and only there.
		const uuid = creates(fpt).find((r) => r.path === '/api/v1/schema/CustomEntity09/fields' && JSON.stringify(r.body).includes('Onset UUID'))!;
		expect(uuid.body).toEqual({
			data_type: 'text',
			properties: [
				{ property_name: 'name', value: 'Onset UUID' },
				{ property_name: 'unique', value: true },
				{ property_name: 'description', value: expect.any(String) }
			]
		});
		expect(fpt.fields.CustomEntity09.sg_onset_uuid.unique?.value).toBe(true);
		expect(fpt.fields.CustomEntity09.sg_photos.properties?.valid_types?.value).toEqual(['Attachment']);
		expect(fpt.fields.Slate.sg_setup_diagram.properties?.valid_types?.value).toEqual(['Attachment']);
		expect(fpt.fields.CustomEntity09.sg_slate.properties?.valid_types?.value).toEqual(['Slate']);
		expect(fpt.fields.CustomEntity09.sg_circled.data_type.value).toBe('checkbox');
	});

	it('finds them present the next time', async () => {
		const { fpt, check } = world('bare');
		await check();
		const before = creates(fpt).length;
		const again = await check();
		expect(again.ready).toBe(true);
		expect(again.fields.every((f) => f.status === 'present')).toBe(true);
		expect(creates(fpt).length).toBe(before);
	});

	it('only looks when told not to create', async () => {
		const { fpt, cache, check } = world('bare');
		const report = await check({ createFields: false });
		expect(report.ready).toBe(false);
		expect(report.fields.every((f) => f.status === 'missing')).toBe(true);
		expect(creates(fpt)).toEqual([]);
		expect(await cache.get(resolutionKey(fpt.site))).toBeUndefined();
	});

	it('says exactly which custom entity to enable and what to name it', async () => {
		const { fpt, check } = world();
		delete fpt.types.CustomEntity09;
		const report = await check();
		expect(report.ready).toBe(false);
		expect(report.entities.find((e) => e.scope === 'take')).toEqual({ scope: 'take', kind: 'custom', displayName: 'Take', status: 'missing' });
		expect(report.fields.some((f) => f.scope === 'take')).toBe(false);
		// The fields of a missing type are never read: a slot absent from /schema is a 404 (findings/008).
		expect(fpt.count((r) => r.path.includes('CustomEntity09'))).toBe(0);
	});

	it('reports an ambiguous display name with every candidate', async () => {
		const { fpt, check } = world();
		fpt.types.CustomEntity31 = { name: { value: 'Take ' } };
		const report = await check();
		expect(report.ready).toBe(false);
		expect(report.entities.find((e) => e.scope === 'take')).toMatchObject({ status: 'ambiguous', candidates: ['CustomEntity09', 'CustomEntity31'] });
	});

	it('cannot create a link to an entity that is missing, and says so', async () => {
		const { fpt, check } = world('bare');
		delete fpt.types.CustomEntity19;
		const report = await check();
		expect(field(report, 'cameraSetup', 'sg_lens')).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Lens') });
		expect(field(report, 'cameraSetup', 'sg_camera').status).toBe('created');
	});

	// corpus findings/132_field_create_rights.md: an Artist gets 500 code 105, an Admin 201.
	it('without the right to create fields, stops at the first refusal and says an Admin must do it', async () => {
		const { fpt, check } = world('bare');
		fpt.canCreateFields = false;
		const report = await check();
		expect(report.ready).toBe(false);
		expect(report.canCreateFields).toBe(false);
		expect(report.fields.every((f) => f.status === 'needsAdmin')).toBe(true);
		expect(report.fields.some((f) => f.reason)).toBe(false);
		// It stops at the first refusal rather than asking for each field.
		expect(creates(fpt).length).toBe(1);
	});

	it('takes another 500 on a field create as a failure of that field, and goes on', async () => {
		const { fpt, check } = world('bare');
		fpt.failNext((r) => r.method === 'POST' && r.path === '/api/v1/schema/Camera/fields', { status: 500 });
		const report = await check();
		expect(report.canCreateFields).toBe(true);
		expect(field(report, 'camera', 'sg_onset_uuid')).toMatchObject({ status: 'failed' });
		expect(report.fields.filter((f) => f.status === 'created').length).toBe(WANTED - 1);
	});

	// corpus findings/142_reverse_field.md: every link field adds a field on the type it links.
	it('lists the fields Flow PT will add for each link, before creating anything', async () => {
		const { fpt, check } = world('bare');
		const report = await check({ createFields: false });
		expect(report.reverseFields).toContainEqual({ entityType: 'Slate', name: 'sg_takes', displayName: 'Take <-> Slate', source: 'CustomEntity09.sg_slate', status: 'willAppear' });
		expect(report.reverseFields).toContainEqual(
			expect.objectContaining({ entityType: 'Attachment', name: 'custom_entity09_sg_photos_custom_entity09s', source: 'CustomEntity09.sg_photos' })
		);
		// One per link field we create: none for `project`, a stock field.
		const links = report.fields.filter((f) => f.dataType === 'entity' || f.dataType === 'multi_entity');
		expect(report.reverseFields.length).toBe(links.length);
		expect(creates(fpt)).toEqual([]);
	});

	it('creates, then finds the link fields and the fields they added present: a second run changes nothing', async () => {
		const { fpt, check } = world('bare');
		const first = await check();
		expect(first.ready).toBe(true);
		expect(fpt.fields.Slate.sg_takes?.properties?.valid_types?.value).toEqual(['CustomEntity09']);
		const before = fpt.requests.length;
		const again = await check();
		expect(again.ready).toBe(true);
		expect(again.reverseFields.every((r) => r.status === 'present')).toBe(true);
		expect(fpt.requests.slice(before).every((r) => r.method === 'GET')).toBe(true);
	});

	// The slate's Shots link: a multi_entity to Shot (findings/116) that adds a field on Shot listing
	// the slates (findings/142), so a Shot shows its slates.
	it('creates the Shots link of the slate, and Flow PT adds the field on Shot that lists the slates', async () => {
		const { fpt, check } = world('bare');
		const before = await check({ createFields: false });
		expect(field(before, 'slate', 'sg_shots')).toMatchObject({ status: 'missing', dataType: 'multi_entity', validTypes: ['Shot'] });
		expect(before.reverseFields).toContainEqual({ entityType: 'Shot', name: 'slate_sg_shots_slates', displayName: 'Slates <-> Shots', source: 'Slate.sg_shots', status: 'willAppear' });
		const report = await check();
		expect(field(report, 'slate', 'sg_shots').status).toBe('created');
		expect(fpt.fields.Slate.sg_shots.properties?.valid_types?.value).toEqual(['Shot']);
		expect(fpt.fields.Shot.slate_sg_shots_slates).toMatchObject({ data_type: { value: 'multi_entity' }, properties: { valid_types: { value: ['Slate'] } } });
	});

	// Kevin, #102: the Set Shot gets its unique key and its Shots, the slate its Set Shots. Each link
	// adds a field on the type it links (findings/142).
	it('creates the Set Shot fields and the Set Shots link of the slate, and says what Flow PT adds', async () => {
		const { fpt, check } = world('bare');
		const before = await check({ createFields: false });
		expect(field(before, 'setShot', 'sg_onset_key')).toMatchObject({ status: 'missing', entityType: 'CustomEntity22', dataType: 'text', unique: true });
		expect(field(before, 'setShot', 'sg_shots')).toMatchObject({ status: 'missing', dataType: 'multi_entity', validTypes: ['Shot'] });
		expect(field(before, 'slate', 'sg_set_shots')).toMatchObject({ status: 'missing', dataType: 'multi_entity', validTypes: ['CustomEntity22'] });
		expect(before.reverseFields).toContainEqual({
			entityType: 'CustomEntity22',
			name: 'slate_sg_set_shots_slates',
			displayName: 'Slates <-> Set Shots',
			source: 'Slate.sg_set_shots',
			status: 'willAppear'
		});
		expect(before.reverseFields).toContainEqual({
			entityType: 'Shot',
			name: 'custom_entity22_sg_shots_custom_entity22s',
			displayName: 'Set Shots <-> Shots',
			source: 'CustomEntity22.sg_shots',
			status: 'willAppear'
		});
		const report = await check();
		expect(report.ready).toBe(true);
		expect(fpt.fields.CustomEntity22.sg_onset_key.unique?.value).toBe(true);
		expect(fpt.fields.Shot.custom_entity22_sg_shots_custom_entity22s).toMatchObject({ properties: { valid_types: { value: ['CustomEntity22'] } } });
		expect(fpt.fields.CustomEntity22.slate_sg_set_shots_slates).toMatchObject({ properties: { valid_types: { value: ['Slate'] } } });
	});

	// Kevin, #117: Set Shot is optional. Its absence is a note: the rest is ready, its links wait.
	it('is ready without the Set Shot entity, and names it as optional', async () => {
		const { fpt, cache, check } = world();
		delete fpt.types.CustomEntity22;
		delete fpt.fields.Slate.sg_set_shots;
		const report = await check();
		expect(report.ready).toBe(true);
		expect(report.entities.find((e) => e.scope === 'setShot')).toEqual({ scope: 'setShot', kind: 'custom', displayName: 'Set Shot', status: 'missing', optional: true });
		expect(report.fields.some((f) => f.scope === 'setShot' || f.name === 'sg_set_shots')).toBe(false);
		expect(creates(fpt)).toEqual([]);
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.entities.setShot).toBeUndefined();
	});

	it('makes the Set Shot fields once an admin enabled it, on Set Up Fields', async () => {
		const { fpt, cache, check } = world();
		const slot = fpt.types.CustomEntity22;
		const fields = fpt.fields.CustomEntity22;
		delete fpt.types.CustomEntity22;
		delete fpt.fields.Slate.sg_set_shots;
		await check();
		fpt.types.CustomEntity22 = slot;
		fpt.fields.CustomEntity22 = { code: fields.code, project: fields.project };
		const before = await check({ createFields: false });
		expect(before.ready).toBe(true);
		expect(field(before, 'setShot', 'sg_onset_matched')).toMatchObject({ status: 'missing', dataType: 'checkbox' });
		expect(field(before, 'slate', 'sg_set_shots')).toMatchObject({ status: 'missing' });
		const report = await check();
		expect(field(report, 'setShot', 'sg_onset_matched').status).toBe('created');
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.entities.setShot).toBe('CustomEntity22');
	});

	it('does not create the Shots link when Shot already has the field it would add', async () => {
		const { fpt, check } = world('bare');
		fpt.fields.Shot.slate_sg_shots_slates = rawField('text', 'Slates Shots');
		const report = await check();
		expect(report.ready).toBe(false);
		expect(field(report, 'slate', 'sg_shots')).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Shot.slate_sg_shots_slates') });
	});

	it('does not create a link whose added field would collide, and says which', async () => {
		const { fpt, check } = world('bare');
		fpt.fields.Slate.sg_takes = rawField('number', 'Takes');
		const report = await check();
		expect(report.ready).toBe(false);
		expect(field(report, 'take', 'sg_slate')).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Slate.sg_takes') });
		expect(creates(fpt).some((r) => r.path === '/api/v1/schema/CustomEntity09/fields' && JSON.stringify(r.body).includes('"Slate"'))).toBe(false);
		expect(fpt.fields.Slate.sg_takes.data_type.value).toBe('number');
	});

	// findings/142: deleting a reverse field deletes the link too. Setup never deletes a field.
	it('never deletes or changes a field', async () => {
		const { fpt, check } = world('bare');
		await check();
		await check();
		expect(fpt.requests.filter((r) => r.path.includes('/schema/') && (r.method === 'DELETE' || r.method === 'PUT'))).toEqual([]);
	});

	it('uses a site field of the same name and type, and steps aside from one that differs', async () => {
		const { fpt, check } = world('bare');
		fpt.fields.CustomEntity19.sg_lens_serial_number = rawField('text', 'Lens Serial Number');
		fpt.fields.CustomEntity19.sg_focal_length = rawField('text', 'Focal Length');
		const report = await check();
		expect(report.ready).toBe(true);
		expect(field(report, 'lens', 'sg_lens_serial_number').status).toBe('present');
		expect(field(report, 'lens', 'sg_onset_focal_length')).toMatchObject({ status: 'created', displayName: 'Onset Focal Length', reason: expect.any(String) });
		expect(fpt.fields.CustomEntity19.sg_focal_length.data_type.value).toBe('text');
	});

	// corpus endpoints/post_schema_type_fields.md: the name is in links.self, and may not be the one asked for.
	it('does not trust a create that answers another name', async () => {
		const { fpt, check } = world('bare');
		fpt.failNext((r) => r.method === 'POST' && r.path === '/api/v1/schema/Camera/fields', {
			status: 201,
			body: { data: {}, links: { self: '/api/v1/schema/Camera/fields/sg_onset_uuid_1' } }
		});
		const report = await check();
		expect(report.ready).toBe(false);
		expect(field(report, 'camera', 'sg_onset_uuid')).toMatchObject({ status: 'failed', reason: expect.stringContaining('sg_onset_uuid_1') });
	});

	it('reports a create the site refuses for another reason, and goes on', async () => {
		const { fpt, check } = world('bare');
		fpt.failNext((r) => r.method === 'POST' && r.path === '/api/v1/schema/Camera/fields', {
			status: 400,
			body: { errors: [{ status: 400, code: 105, title: 'API schema_field_create() failed, there is a retired field with the same field_name: sg_onset_uuid.' }] }
		});
		const report = await check();
		expect(report.ready).toBe(false);
		expect(field(report, 'camera', 'sg_onset_uuid')).toMatchObject({ status: 'failed', reason: expect.stringContaining('retired field') });
		expect(report.fields.filter((f) => f.status === 'created').length).toBe(WANTED - 1);
	});

	it('throws what the transport throws when the site cannot be asked', async () => {
		const { fpt, check } = world();
		fpt.bearerValid = false;
		await expect(check()).rejects.toMatchObject({ kind: 'unauthorized' });
		fpt.bearerValid = true;
		fpt.online = false;
		await expect(check()).rejects.toBeInstanceOf(TransportError);
		await expect(check()).rejects.toMatchObject({ kind: 'unreachable' });
	});
});
