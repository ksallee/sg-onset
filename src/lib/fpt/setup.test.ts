import { describe, expect, it } from 'vitest';
import { TransportError } from '$lib/outbox/transport';
import { memoryKeyValue, resolutionKey } from './cache';
import { BEARER, fakeFpt, type FakeFpt } from './fakeFpt';
import { ENTITY_SCOPES, wantedColumns } from './mapping';
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
const WANTED = ENTITY_SCOPES.reduce((n, s) => n + wantedColumns(s).length, 0);

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
	it('reads the type list once and the fields of each of the seven types once', async () => {
		const { fpt, check } = world();
		await check();
		expect(fpt.requests.map((r) => r.path).sort()).toEqual(['/api/v1/schema', ...Object.values(TYPES).map((t) => `/api/v1/schema/${t}/fields`)].sort());
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
		expect(fpt.fields.CustomEntity09.sg_stills.properties?.valid_types?.value).toEqual(['Attachment']);
		expect(fpt.fields.CustomEntity09.sg_slate.properties?.valid_types?.value).toEqual(['Slate']);
		expect(fpt.fields.CustomEntity09.sg_circle_take.data_type.value).toBe('checkbox');
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

	it('without the right to create fields, lists every field an admin must create', async () => {
		const { fpt, check } = world('bare');
		fpt.canCreateFields = false;
		const report = await check();
		expect(report.ready).toBe(false);
		expect(report.canCreateFields).toBe(false);
		expect(report.fields.every((f) => f.status === 'needsAdmin')).toBe(true);
		expect(field(report, 'take', 'sg_onset_uuid')).toMatchObject({ entityType: 'CustomEntity09', displayName: 'Onset UUID', dataType: 'text', unique: true });
		expect(field(report, 'take', 'sg_slate')).toMatchObject({ displayName: 'Slate', dataType: 'entity', validTypes: ['Slate'] });
		// It stops at the first refusal rather than asking for each field.
		expect(creates(fpt).length).toBe(1);
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
