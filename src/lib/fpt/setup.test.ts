import { describe, expect, it } from 'vitest';
import { TransportError } from '$lib/outbox/transport';
import { createApi } from './api';
import { memoryKeyValue, resolutionKey } from './cache';
import { BEARER, fakeFpt, type FakeFpt } from './fakeFpt';
import { ENTITY_SCOPES, NOTE_COLUMNS, PROJECT_COLUMNS, VERSION_COLUMNS, wantedColumns } from './mapping';
import type { Naming } from './naming';
import { parseResolution } from './schema';
import { checkSetup, loadResolution, readNamesReview, setUpNames, type SetupReport } from './setup';
import { rawField, TYPES } from './testkit';

function world(fields: 'complete' | 'bare' = 'complete') {
	const fpt = fakeFpt({ fields });
	const cache = memoryKeyValue();
	const check = (extra: { createFields?: boolean; actionMenu?: { projectId: number; url: string } } = {}) =>
		checkSetup({ site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: cache, online: () => fpt.online, ...extra });
	return { fpt, cache, check };
}

const creates = (fpt: FakeFpt) => fpt.requests.filter((r) => r.method === 'POST' && r.path.includes('/schema/'));
const field = (report: SetupReport, scope: string, name: string) => report.fields.find((f) => f.scope === scope && f.name === name)!;
/**
 * Every field of ours: on the entities, the client UUID on Version, where videos go, the two on Note
 * (#97) and the two shared lists on Project (#110).
 */
const WANTED = ENTITY_SCOPES.reduce((n, s) => n + wantedColumns(s).length, 0) + VERSION_COLUMNS.length + NOTE_COLUMNS.length + PROJECT_COLUMNS.length;

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
	it('reads the type list once and the fields of each of the nine types, Attachment, Shot, Version, Note and Project once', async () => {
		const { fpt, check } = world();
		await check();
		expect(fpt.requests.map((r) => r.path).sort()).toEqual(
			['/api/v1/schema', ...[...Object.values(TYPES), 'Attachment', 'Shot', 'Version', 'Note', 'Project'].map((t) => `/api/v1/schema/${t}/fields`)].sort()
		);
	});

	// The shared lists (#110): the templates and the kinds of set reference, as JSON in two text
	// fields of the Project. Optional: a site set up before them syncs the rest, and the lists wait.
	it('creates the three lists on Project, and the transport may use them', async () => {
		const { fpt, cache, check } = world('bare');
		const report = await check();
		expect(field(report, 'project', 'sg_onset_templates')).toMatchObject({ entityType: 'Project', status: 'created', dataType: 'text' });
		expect(field(report, 'project', 'sg_onset_reference_kinds')).toMatchObject({ entityType: 'Project', status: 'created', dataType: 'text' });
		expect(field(report, 'project', 'sg_onset_rigs')).toMatchObject({ entityType: 'Project', status: 'created', dataType: 'text' });
		expect(fpt.fields.Project.sg_onset_templates.data_type.value).toBe('text');
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.project).toEqual({ templates: 'sg_onset_templates', referenceKinds: 'sg_onset_reference_kinds', rigs: 'sg_onset_rigs' });
	});

	it('is ready while Project lacks them, and says they are missing', async () => {
		const { fpt, cache, check } = world();
		delete fpt.fields.Project.sg_onset_templates;
		const report = await check({ createFields: false });
		expect(report.ready).toBe(true);
		expect(field(report, 'project', 'sg_onset_templates')).toMatchObject({ status: 'missing' });
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.project).toBeUndefined();
	});

	// Notes on Shots (#97): one Note per Shot, keyed in a unique text field (findings/146).
	it('creates the key on Note, unique, and the list beside it, and the transport may use them', async () => {
		const { fpt, cache, check } = world('bare');
		const report = await check();
		expect(field(report, 'note', 'sg_onset_key')).toMatchObject({ entityType: 'Note', status: 'created', unique: true });
		expect(field(report, 'note', 'sg_onset_captured')).toMatchObject({ entityType: 'Note', status: 'created' });
		expect(fpt.fields.Note.sg_onset_key.unique?.value).toBe(true);
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.note).toEqual({ key: 'sg_onset_key', captured: 'sg_onset_captured' });
	});

	// They are optional: a site set up before them syncs the rest, and the Notes wait.
	it('is ready while Note lacks them, and says they are missing', async () => {
		const { fpt, cache, check } = world();
		delete fpt.fields.Note.sg_onset_key;
		delete fpt.fields.Note.sg_onset_captured;
		const report = await check({ createFields: false });
		expect(report.ready).toBe(true);
		expect(field(report, 'note', 'sg_onset_key')).toMatchObject({ status: 'missing' });
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.note).toBeUndefined();
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

	// The slates a set reference shows on (#107): a multi_entity to Slate beside `sg_slate`, which adds
	// a field on Slate listing them (findings/142).
	it('creates the Slates link of the set reference, and Flow PT adds the field on Slate that lists them', async () => {
		const { fpt, check } = world('bare');
		const before = await check({ createFields: false });
		expect(field(before, 'reference', 'sg_slates')).toMatchObject({ status: 'missing', dataType: 'multi_entity', validTypes: ['Slate'] });
		expect(before.reverseFields).toContainEqual({ entityType: 'Slate', name: 'custom_entity21_sg_slates_custom_entity21s', displayName: 'Set References <-> Slates', source: 'CustomEntity21.sg_slates', status: 'willAppear' });
		const report = await check();
		expect(field(report, 'reference', 'sg_slates').status).toBe('created');
		expect(fpt.fields.Slate.custom_entity21_sg_slates_custom_entity21s).toMatchObject({ data_type: { value: 'multi_entity' }, properties: { valid_types: { value: ['CustomEntity21'] } } });
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

	// Kevin, #117: Set Reference is optional. Its absence is a note: the rest is ready, the references wait.
	it('is ready without the Set Reference entity, and names it as optional', async () => {
		const { fpt, cache, check } = world();
		delete fpt.types.CustomEntity21;
		const report = await check();
		expect(report.ready).toBe(true);
		expect(report.entities.find((e) => e.scope === 'reference')).toEqual({ scope: 'reference', kind: 'custom', displayName: 'Set Reference', status: 'missing', optional: true });
		expect(report.fields.some((f) => f.scope === 'reference' || f.entityType === 'CustomEntity21')).toBe(false);
		expect(report.reverseFields.some((r) => r.source.startsWith('CustomEntity21.'))).toBe(false);
		expect(creates(fpt)).toEqual([]);
		const res = parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site);
		expect(res?.entities.reference).toBeUndefined();
		expect(res?.entities.take).toBe('CustomEntity09');
	});

	it('makes the Set Reference fields once an admin enabled it, on Set Up Fields', async () => {
		const { fpt, cache, check } = world();
		const slot = fpt.types.CustomEntity21;
		const fields = fpt.fields.CustomEntity21;
		delete fpt.types.CustomEntity21;
		await check();
		fpt.types.CustomEntity21 = slot;
		fpt.fields.CustomEntity21 = { code: fields.code, project: fields.project };
		const before = await check({ createFields: false });
		expect(before.ready).toBe(true);
		expect(field(before, 'reference', 'sg_slate')).toMatchObject({ status: 'missing', dataType: 'entity', validTypes: ['Slate'] });
		expect(field(before, 'reference', 'sg_slates')).toMatchObject({ status: 'missing', dataType: 'multi_entity', validTypes: ['Slate'] });
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.entities.reference).toBeUndefined();
		const report = await check();
		expect(field(report, 'reference', 'sg_onset_uuid')).toMatchObject({ status: 'created', unique: true });
		expect(field(report, 'reference', 'sg_slates').status).toBe('created');
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)?.entities.reference).toBe('CustomEntity21');
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

// #106: Set Up Fields adds the Action Menu Item "Send set data to artists" on Shot and on Set Shot,
// for the project. Found again by title and URL, never made twice (findings/156_action_menu_item.md).
describe('checkSetup: the Action Menu Item', () => {
	const URL_ = 'https://onset.example/action/send-set-data';
	const TITLE = 'Send set data to artists';
	const items = (fpt: FakeFpt) => fpt.live('ActionMenuItem');
	const itemWrites = (fpt: FakeFpt) => fpt.requests.filter((r) => /\/entity\/action_menu_items(\/\d+)?$/.test(r.path) && r.method !== 'GET');
	function setUp(fields: 'complete' | 'bare' = 'complete') {
		const w = world(fields);
		const projectId = w.fpt.seed('Project', { name: 'Show' });
		return { ...w, projectId, run: (createFields = true, id = projectId) => w.check({ createFields, actionMenu: { projectId: id, url: URL_ } }) };
	}

	it('is made on Shot and on Set Shot, for the project, pointing at this deploy', async () => {
		const { fpt, projectId, run } = setUp();
		const report = await run();
		expect(report.action).toEqual({
			title: TITLE,
			url: URL_,
			items: [
				{ entityType: 'Shot', status: 'added' },
				{ entityType: 'CustomEntity22', status: 'added' }
			]
		});
		expect(items(fpt).map((r) => r.values)).toEqual([
			{ created_at: expect.any(String), title: TITLE, url: URL_, entity_type: 'Shot', projects: [{ type: 'Project', id: projectId }] },
			{ created_at: expect.any(String), title: TITLE, url: URL_, entity_type: 'CustomEntity22', projects: [{ type: 'Project', id: projectId }] }
		]);
		// It changes nothing about readiness: the fields decide that.
		expect(report.ready).toBe(true);
	});

	it('is found again by title and URL: a second run writes nothing', async () => {
		const { fpt, run } = setUp();
		await run();
		const before = itemWrites(fpt).length;
		const report = await run();
		expect(report.action?.items.map((i) => i.status)).toEqual(['present', 'present']);
		expect(itemWrites(fpt).length).toBe(before);
		expect(items(fpt)).toHaveLength(2);
	});

	it('only looks when told not to create', async () => {
		const { fpt, run } = setUp();
		const report = await run(false);
		expect(report.action?.items).toEqual([
			{ entityType: 'Shot', status: 'missing' },
			{ entityType: 'CustomEntity22', status: 'missing' }
		]);
		expect(itemWrites(fpt)).toEqual([]);
	});

	it('another project is added to the same rows, never a second pair', async () => {
		const { fpt, projectId, run } = setUp();
		await run();
		const other = fpt.seed('Project', { name: 'Other show' });
		expect((await run(false, other)).action?.items.map((i) => i.status)).toEqual(['missing', 'missing']);
		const report = await run(true, other);
		expect(report.action?.items.map((i) => i.status)).toEqual(['added', 'added']);
		expect(items(fpt)).toHaveLength(2);
		expect(items(fpt)[0].values.projects).toEqual([
			{ type: 'Project', id: projectId },
			{ type: 'Project', id: other }
		]);
		// In place, the mode in the body (recipes/009).
		expect(itemWrites(fpt).filter((r) => r.method === 'PUT').map((r) => r.body)).toEqual([
			{ projects: { multi_entity_update_mode: 'add', value: [{ type: 'Project', id: other }] } },
			{ projects: { multi_entity_update_mode: 'add', value: [{ type: 'Project', id: other }] } }
		]);
	});

	it('a deploy elsewhere has its own: another URL is another row', async () => {
		const { fpt, projectId, check } = setUp();
		await check({ actionMenu: { projectId, url: URL_ } });
		await check({ actionMenu: { projectId, url: 'https://onset.studio.com/action/send-set-data' } });
		expect(items(fpt).map((r) => r.values.url)).toEqual([URL_, URL_, 'https://onset.studio.com/action/send-set-data', 'https://onset.studio.com/action/send-set-data']);
	});

	it('on Shot only while the Set Shot entity is not enabled (#117)', async () => {
		const { fpt, run } = setUp();
		delete fpt.types.CustomEntity22;
		delete fpt.fields.Slate.sg_set_shots;
		const report = await run();
		expect(report.action?.items).toEqual([{ entityType: 'Shot', status: 'added' }]);
		expect(items(fpt).map((r) => r.values.entity_type)).toEqual(['Shot']);
	});

	it('an account that may not create one is told an Admin must, and the second is not tried', async () => {
		const { fpt, run } = setUp();
		fpt.forbidden.add('create:ActionMenuItem');
		const report = await run();
		expect(report.action?.items).toEqual([
			{ entityType: 'Shot', status: 'needsAdmin' },
			{ entityType: 'CustomEntity22', status: 'needsAdmin' }
		]);
		expect(itemWrites(fpt)).toHaveLength(1);
		// The fields still went.
		expect(report.ready).toBe(true);
	});

	it('another refusal is that row’s, with the site’s words; the next is tried', async () => {
		const { fpt, run } = setUp();
		fpt.failNext((r) => r.method === 'POST' && r.path.endsWith('/entity/action_menu_items'), { status: 400, body: { errors: [{ status: 400, code: 103, title: 'Something else' }] } });
		const report = await run();
		expect(report.action?.items).toEqual([
			{ entityType: 'Shot', status: 'failed', reason: 'Something else' },
			{ entityType: 'CustomEntity22', status: 'added' }
		]);
	});

	it('no answer while looking for it: said, and the fields made before are kept', async () => {
		const { fpt, cache, run } = setUp('bare');
		fpt.failNext((r) => r.path.endsWith('/action_menu_items/_search'), 'network');
		const report = await run();
		expect(report.action?.items.map((i) => i.status)).toEqual(['failed', 'failed']);
		expect(report.ready).toBe(true);
		expect(parseResolution(await cache.get(resolutionKey(fpt.site)), fpt.site)).toBeDefined();
	});

	it('nothing is asked about it without a project', async () => {
		const { fpt, check } = setUp();
		const report = await check();
		expect(report.action).toBeUndefined();
		expect(fpt.requests.some((r) => r.path.includes('action_menu_items'))).toBe(false);
	});
});

// #111: the names an admin picked. Every test above runs on the default.
describe('checkSetup and loadResolution: the names an admin picked', () => {
	const naming: Naming = { entities: { take: 'Shot Take', setShot: 'Shot Code' }, fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' }, 'take.sg_circled': { field: 'sg_circle' } } };
	const options = (fpt: FakeFpt, cache = memoryKeyValue()) => ({ site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: cache, online: () => fpt.online });

	it('says each entity under its chosen name, and creates the fields under theirs', async () => {
		const fpt = fakeFpt({ fields: 'bare' });
		fpt.types.CustomEntity09 = { name: { value: 'Shot Take' } };
		delete fpt.types.CustomEntity22;
		fpt.fields.CustomEntity09.sg_circle = rawField('checkbox', 'Circle');
		const report = await checkSetup({ ...options(fpt), naming, createFields: true });
		expect(report.ready).toBe(true);
		expect(report.entities.find((e) => e.scope === 'take')).toMatchObject({ displayName: 'Shot Take', status: 'found' });
		expect(report.entities.find((e) => e.scope === 'setShot')).toMatchObject({ displayName: 'Shot Code', status: 'missing', optional: true });
		expect(field(report, 'take', 'sg_studio_t_stop')).toMatchObject({ displayName: 'Studio T-Stop', status: 'created' });
		expect(field(report, 'take', 'sg_circle')).toMatchObject({ displayName: 'Circle', status: 'present' });
		expect(creates(fpt).some((r) => JSON.stringify(r.body).includes('"Circled"'))).toBe(false);
	});

	it('names a missing custom entity under its chosen name when the site is not ready', async () => {
		const fpt = fakeFpt();
		await expect(loadResolution(createApi(options(fpt)), { ...options(fpt), naming })).rejects.toMatchObject({ kind: 'failed', message: expect.stringContaining('the Shot Take entity') });
	});

	it('uses a schema kept under other names when none is asked for, and reads it again when other names are', async () => {
		const fpt = fakeFpt({ fields: 'bare' });
		fpt.types.CustomEntity09 = { name: { value: 'Shot Take' } };
		fpt.fields.CustomEntity09.sg_circle = rawField('checkbox', 'Circle');
		const cache = memoryKeyValue();
		await checkSetup({ ...options(fpt, cache), naming, createFields: true });
		const reads = () => fpt.count((r) => r.path === '/api/v1/schema');
		const before = reads();
		const kept = await loadResolution(createApi(options(fpt, cache)), options(fpt, cache));
		expect(kept.naming).toEqual(naming);
		expect(reads()).toBe(before);
		expect((await loadResolution(createApi(options(fpt, cache)), { ...options(fpt, cache), naming })).fields.take.sg_t_stop).toBe('sg_studio_t_stop');
		expect(reads()).toBe(before);
		// Asked for the default names, it is read again: the site has no entity named Take.
		await expect(loadResolution(createApi(options(fpt, cache)), { ...options(fpt, cache), naming: {} })).rejects.toMatchObject({ kind: 'failed' });
		expect(reads()).toBe(before + 1);
	});
});

// #111, the second part: the names kept on the Flow PT project, in `Project.sg_onset_naming`
// (Kevin: one fixed text field, never renamed; a site without it uses today's names).
describe('the names a project keeps', () => {
	const naming: Naming = { entities: { take: 'Shot Take' }, fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' } } };
	function world() {
		const fpt = fakeFpt({ fields: 'bare' });
		const projectId = fpt.seed('Project', { name: 'Show' });
		const cache = memoryKeyValue();
		const options = { site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: cache, online: () => fpt.online, projectId };
		return { fpt, projectId, cache, options };
	}
	/** A site with the take named Shot Take. */
	function named() {
		const w = world();
		w.fpt.types.CustomEntity09 = { name: { value: 'Shot Take' } };
		return w;
	}
	const stored = (w: ReturnType<typeof world>) => w.fpt.rows.get(`Project:${w.projectId}`)!.values.sg_onset_naming;

	it('saves the names on the project, making the field once, with the fields under them', async () => {
		const w = named();
		const { names, report } = await setUpNames({ ...w.options, naming, createFields: true });
		expect(names).toBe('saved');
		expect(report.ready).toBe(true);
		expect(report.naming).toEqual({ saved: 'saved', naming });
		// One text field on Project (findings/157), JSON in it (findings/158).
		expect(w.fpt.fields.Project.sg_onset_naming).toMatchObject({ data_type: { value: 'text' }, name: { value: 'Onset Naming' } });
		expect(JSON.parse(String(stored(w)))).toEqual({ app: 'sg-onset', naming: 1, entities: { take: 'Shot Take' }, fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' } } });
		expect(w.fpt.fields.CustomEntity09.sg_studio_t_stop).toBeDefined();
		// The schema kept here is under them.
		expect(parseResolution(await w.cache.get(resolutionKey(w.fpt.site)), w.fpt.site)?.naming).toEqual(naming);
		// Saved again: changed nothing.
		const again = await setUpNames({ ...w.options, naming: { fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' } }, entities: { take: 'Shot Take' } }, createFields: true });
		expect(again.names).toBe('unchanged');
	});

	it('checks under the names the project keeps, and says so', async () => {
		const w = named();
		await setUpNames({ ...w.options, naming, createFields: true });
		const fresh = memoryKeyValue();
		const report = await checkSetup({ ...w.options, schemaCache: fresh });
		expect(report.ready).toBe(true);
		expect(report.naming).toEqual({ saved: 'saved', naming });
		expect(report.entities.find((e) => e.scope === 'take')).toMatchObject({ displayName: 'Shot Take', entityType: 'CustomEntity09' });
		expect((await loadResolution(createApi({ ...w.options, schemaCache: memoryKeyValue() }), { ...w.options, schemaCache: memoryKeyValue() })).fields.take.sg_t_stop).toBe('sg_studio_t_stop');
	});

	it('uses the default names on a site without the field, asking nothing more of the project', async () => {
		const w = world();
		const report = await checkSetup({ ...w.options, createFields: true });
		expect(report.ready).toBe(true);
		expect(report.naming).toEqual({ saved: 'none', naming: {} });
		expect(w.fpt.requests.some((r) => r.path === '/api/v1/entity/projects/_search')).toBe(false);
	});

	it('neither plans nor makes anything under names a later version saved, and never writes over them', async () => {
		const w = world();
		w.fpt.fields.Project.sg_onset_naming = rawField('text', 'Onset Naming');
		w.fpt.rows.get(`Project:${w.projectId}`)!.values.sg_onset_naming = JSON.stringify({ app: 'sg-onset', naming: 2, entities: {}, fields: {} });
		const report = await checkSetup({ ...w.options, createFields: true });
		expect(report).toMatchObject({ ready: false, entities: [], fields: [], naming: { saved: 'unreadable' } });
		expect(creates(w.fpt)).toEqual([]);
		await expect(loadResolution(createApi(w.options), w.options)).rejects.toMatchObject({ kind: 'failed', message: expect.stringContaining('newer SG OnSet') });
		const { names } = await setUpNames({ ...w.options, naming, createFields: true });
		expect(names).toBe('unreadable');
		expect(JSON.parse(String(stored(w))).naming).toBe(2);
	});

	it('keeps the names off the project while the site is not ready under them and was under the ones it keeps', async () => {
		const w = world();
		await checkSetup({ ...w.options, createFields: true });
		// Shot Take is not enabled: the site would not be ready, and other devices would stop.
		const { names, report } = await setUpNames({ ...w.options, naming, createFields: true });
		expect(names).toBe('notReady');
		expect(report.ready).toBe(false);
		expect(report.entities.find((e) => e.scope === 'take')).toMatchObject({ displayName: 'Shot Take', status: 'missing' });
		expect(stored(w) ?? null).toBeNull();
		// The schema kept here stays under the default names.
		expect(parseResolution(await w.cache.get(resolutionKey(w.fpt.site)), w.fpt.site, {})).toBeDefined();
	});

	it('saves names a site not ready yet will need: nothing syncs there to stop', async () => {
		const w = world();
		const { names } = await setUpNames({ ...w.options, naming, createFields: true });
		expect(names).toBe('saved');
		expect(stored(w)).toBeDefined();
	});

	it('needs an admin: an Artist may neither make the field nor write it (findings/157, 159)', async () => {
		const artist = named();
		artist.fpt.canCreateFields = false;
		expect((await setUpNames({ ...artist.options, naming, createFields: true })).names).toBe('needsAdmin');
		expect(artist.fpt.fields.Project.sg_onset_naming).toBeUndefined();

		const member = named();
		await setUpNames({ ...member.options, naming: { fields: { 'take.sg_tilt': { display: 'Studio Tilt' } }, entities: { take: 'Shot Take' } }, createFields: true });
		member.fpt.forbidden.add('update:Project');
		const before = stored(member);
		expect((await setUpNames({ ...member.options, naming, createFields: true })).names).toBe('needsAdmin');
		expect(stored(member)).toBe(before);
	});
});

describe('readNamesReview', () => {
	it('reads the site once with every custom entity, what the project keeps, and whether it synced', async () => {
		const fpt = fakeFpt();
		const projectId = fpt.seed('Project', { name: 'Show' });
		const options = { site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: memoryKeyValue(), online: () => fpt.online, projectId };
		const review = await readNamesReview(options);
		expect(review.named).toEqual({ saved: 'none', naming: {} });
		expect(review.synced).toBe(false);
		expect(review.canSave).toBeUndefined();
		// The Location slot is read too: an admin may look for any custom entity.
		expect(Object.keys(review.site.fields)).toEqual(expect.arrayContaining(['CustomEntity09', 'CustomEntity29', 'Project', 'Version', 'Note', 'Attachment', 'Shot']));
		// A record of ours in the project: it has synced.
		fpt.seed('Camera', { project: { type: 'Project', id: projectId }, sg_onset_uuid: 'c1' });
		expect((await readNamesReview(options)).synced).toBe(true);
		// Another project's record says nothing about this one.
		const other = fakeFpt();
		const mine = other.seed('Project', { name: 'Show' });
		other.seed('Camera', { project: { type: 'Project', id: other.seed('Project', { name: 'Other' }) }, sg_onset_uuid: 'c1' });
		other.seed('Camera', { project: { type: 'Project', id: mine } });
		expect((await readNamesReview({ ...options, site: other.site, fetch: other.fetch, projectId: mine })).synced).toBe(false);
	});

	it('says whether this account may save, once the field is there (findings/159)', async () => {
		const fpt = fakeFpt();
		const projectId = fpt.seed('Project', { name: 'Show' });
		fpt.fields.Project.sg_onset_naming = rawField('text', 'Onset Naming');
		const options = { site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: memoryKeyValue(), online: () => fpt.online, projectId };
		expect((await readNamesReview(options)).canSave).toBe(true);
		fpt.forbidden.add('update:Project');
		expect((await readNamesReview(options)).canSave).toBe(false);
	});
});

