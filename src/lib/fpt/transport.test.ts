import { describe, expect, it } from 'vitest';
import { TransportError, type BlobRef, type PushOp, type SentPart, type UploadSession } from '$lib/outbox/transport';
import type { Op, RemoteId } from '$lib/outbox/types';
import { memoryKeyValue, resolutionKey } from './cache';
import { BEARER, fakeFpt, STORAGE } from './fakeFpt';
import { encodeStillRemote } from './stills';
import { jwtWith } from './testkit';
import { createFptTransport } from './transport';

type World = ReturnType<typeof world>;

function world(options: { fields?: 'complete' | 'bare'; upload?: { singlePutMax: number; partSize: number } } = {}) {
	const fpt = fakeFpt({ fields: options.fields });
	const projectId = fpt.seed('Project', { name: 'Show' });
	const cache = memoryKeyValue();
	const auth = { bearer: async (_request?: { renew?: boolean }): Promise<string> => BEARER };
	const make = () =>
		createFptTransport({
			site: fpt.site,
			bearer: (request) => auth.bearer(request),
			fetch: fpt.fetch,
			schemaCache: cache,
			projectId,
			now: () => fpt.clock.t,
			online: () => fpt.online,
			...(options.upload ? { upload: options.upload } : {})
		});
	return { fpt, projectId, cache, auth, make, transport: make() };
}

let n = 0;
const op = (o: Exclude<Op, { kind: 'blob' }>, links: Record<string, RemoteId> = {}, remoteId?: RemoteId): PushOp => ({
	entryId: `e${++n}`,
	op: o,
	dependsOn: Object.keys(links),
	links,
	...(remoteId !== undefined ? { remoteId } : {})
});
const create = (table: string, recordId: string, fields: Record<string, unknown>, links: Record<string, RemoteId> = {}) =>
	op({ kind: 'create', table, recordId, fields }, links);
const update = (table: string, recordId: string, remoteId: RemoteId, changes: Record<string, [unknown, unknown]>, links: Record<string, RemoteId> = {}) =>
	op({ kind: 'update', table, recordId, changes: Object.fromEntries(Object.entries(changes).map(([k, [base, value]]) => [k, { base, value }])) }, links, remoteId);
const del = (table: string, recordId: string, remoteId: RemoteId) => op({ kind: 'delete', table, recordId }, {}, remoteId);

const batches = (w: World) => w.fpt.requests.filter((r) => r.path === '/api/v1/entity/_batch');
const applied = async (w: World, ops: PushOp[]): Promise<Record<string, RemoteId>> => {
	const result = await w.transport.push(ops);
	if (result.outcome !== 'applied') throw new Error(`refused: ${JSON.stringify(result.refusals)}`);
	return result.remoteIds;
};

/** A day, a slate and a take on the server, level by level. Returns their server ids by client UUID. */
async function shoot(w: World): Promise<Record<string, RemoteId>> {
	const ids: Record<string, RemoteId> = { p1: w.projectId };
	const send = async (ops: PushOp[]) => {
		const remote = await applied(w, ops);
		for (const o of ops) ids[o.op.recordId] = remote[o.entryId];
	};
	await send([create('shootDay', 'd1', { projectId: 'p1', shootDate: '2026-11-11' }, { p1: ids.p1 })]);
	await send([create('slate', 's1', { shootDayId: 'd1', slateUID: '42A' }, { d1: ids.d1 })]);
	await send([create('take', 't1', { slateId: 's1', take: '1', tStop: 2.8 }, { s1: ids.s1 })]);
	return ids;
}

const kindOf = async (promise: Promise<unknown>): Promise<string> => {
	try {
		await promise;
	} catch (error) {
		return error instanceof TransportError ? error.kind : `not a TransportError: ${String(error)}`;
	}
	return 'no error';
};

describe('push', () => {
	it('creates each scope, linked level by level, with the project and the client UUID on every record', async () => {
		const w = world();
		const { fpt, projectId } = w;
		const p = await applied(w, [create('project', 'p1', { name: 'Show' })]);
		const project = Object.values(p)[0];
		expect(project).toBe(projectId);

		const level1 = [
			create('shootDay', 'd1', { projectId: 'p1', shootDate: '2026-11-11', shootDay: 3 }, { p1: project }),
			create('camera', 'c1', { projectId: 'p1', cameraModel: 'Alexa 35' }, { p1: project }),
			create('lens', 'l1', { projectId: 'p1', lensModel: 'MP 50', focalLength: 50 }, { p1: project }),
			create('lightingSetup', 'ls1', { projectId: 'p1', label: 'Day ext', hdri: true }, { p1: project })
		];
		const r1 = await applied(w, level1);
		const [d1, c1, l1, ls1] = level1.map((o) => r1[o.entryId]);

		const level2 = [
			create('cameraSetup', 'cs1', { projectId: 'p1', cameraLabel: 'A', cameraId: 'c1', lensId: 'l1' }, { p1: project, c1, l1 }),
			create('slate', 's1', { shootDayId: 'd1', slateUID: '42A', lightingSetupId: 'ls1' }, { d1, ls1 })
		];
		const r2 = await applied(w, level2);
		const [cs1, s1] = level2.map((o) => r2[o.entryId]);

		const take = create(
			'take',
			't1',
			{ slateId: 's1', cameraSetupId: 'cs1', cameraId: 'c1', lensId: 'l1', take: '1', startedAt: '2026-11-11T09:00:00.500Z', lensHeight: { m: 1.8288 } },
			{ s1, cs1, c1, l1 }
		);
		const t1 = (await applied(w, [take]))[take.entryId];

		// One batch per level, and nothing for the project (corpus recipes/002_batch.md).
		expect(batches(w).length).toBe(3);
		expect(fpt.byUuid('ShootDay', 'd1')!.values).toMatchObject({ code: '2026-11-11', sg_shoot_date: '2026-11-11', sg_day_number: 3, project: { type: 'Project', id: projectId } });
		expect(fpt.byUuid('Camera', 'c1')!.values).toMatchObject({ code: 'Alexa 35', project: { type: 'Project', id: projectId } });
		expect(fpt.byUuid('CustomEntity19', 'l1')!.values).toMatchObject({ code: 'MP 50', sg_focal_length: 50 });
		expect(fpt.byUuid('CustomEntity11', 'ls1')!.values).toMatchObject({ code: 'Day ext', sg_hdri: true });
		expect(fpt.byUuid('CustomEntity10', 'cs1')!.values).toMatchObject({ code: 'A', sg_camera: { type: 'Camera', id: c1 }, sg_lens: { type: 'CustomEntity19', id: l1 } });
		expect(fpt.byUuid('Slate', 's1')!.values).toMatchObject({
			code: '42A',
			project: { type: 'Project', id: projectId },
			sg_shoot_day: { type: 'ShootDay', id: d1 },
			sg_lighting_setup: { type: 'CustomEntity11', id: ls1 }
		});
		const row = fpt.byUuid('CustomEntity09', 't1')!;
		expect(row.id).toBe(t1);
		expect(row.values).toMatchObject({
			code: '1',
			project: { type: 'Project', id: projectId },
			sg_slate: { type: 'Slate', id: s1 },
			sg_camera_setup: { type: 'CustomEntity10', id: cs1 },
			// The take keeps its capture time (corpus findings/070_authored_timestamps.md).
			created_at: '2026-11-11T09:00:00Z',
			sg_start_time: '2026-11-11T09:00:00Z',
			sg_lens_height_m: 1.8288
		});
	});

	it('sends a level as one batch, in plain JSON, under `requests`', async () => {
		const w = world();
		await applied(w, [create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId }), create('camera', 'c2', { projectId: 'p1', cameraModel: 'B' }, { p1: w.projectId })]);
		const [batch] = batches(w);
		expect(batch.headers.get('content-type')).toBe('application/json');
		expect((batch.body as { requests: unknown[] }).requests).toEqual([
			{ request_type: 'create', entity: 'Camera', data: { project: { type: 'Project', id: w.projectId }, sg_onset_uuid: 'c1', code: 'A' } },
			{ request_type: 'create', entity: 'Camera', data: { project: { type: 'Project', id: w.projectId }, sg_onset_uuid: 'c2', code: 'B' } }
		]);
	});

	it('updates and deletes by server id', async () => {
		const w = world();
		const ids = await shoot(w);
		await applied(w, [update('take', 't1', ids.t1, { tStop: [2.8, 4], circleTake: [undefined, true], notes: [undefined, 'good'] })]);
		expect(w.fpt.byUuid('CustomEntity09', 't1')!.values).toMatchObject({ sg_t_stop: 4, sg_circled: true, sg_set_notes: 'good' });
		await applied(w, [update('take', 't1', ids.t1, { tStop: [4, undefined], circleTake: [true, undefined] })]);
		expect(w.fpt.byUuid('CustomEntity09', 't1')!.values).toMatchObject({ sg_t_stop: null, sg_circled: false });
		await applied(w, [del('take', 't1', ids.t1)]);
		expect(w.fpt.byUuid('CustomEntity09', 't1')).toBeUndefined();
	});

	it('resolves the schema once and keeps it on the device', async () => {
		const w = world();
		await applied(w, [create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId })]);
		const reads = () => w.fpt.count((r) => r.path.startsWith('/api/v1/schema'));
		// /schema, the seven types, and Attachment, where the photos field adds one (findings/142).
		expect(reads()).toBe(9);
		await applied(w, [create('camera', 'c2', { projectId: 'p1', cameraModel: 'B' }, { p1: w.projectId })]);
		expect(reads()).toBe(9);
		expect(await w.cache.get(resolutionKey(w.fpt.site))).toBeDefined();
		// Another session on the same device starts from the cache.
		await w.make().push([create('camera', 'c3', { projectId: 'p1', cameraModel: 'C' }, { p1: w.projectId })]);
		expect(reads()).toBe(9);
	});

	it('does not send to a site that is not set up, and says what is missing', async () => {
		const w = world({ fields: 'bare' });
		const push = w.transport.push([create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId })]);
		await expect(push).rejects.toMatchObject({ kind: 'failed', message: expect.stringContaining('ShootDay.sg_onset_uuid') });
		expect(batches(w)).toEqual([]);
		expect(w.fpt.requests.every((r) => r.method === 'GET')).toBe(true);
	});

	it('never creates, renames or deletes the project', async () => {
		const w = world();
		const made = create('project', 'p1', { name: 'Show' });
		expect(await w.transport.push([made])).toEqual({ outcome: 'applied', remoteIds: { [made.entryId]: w.projectId } });
		const renamed = update('project', 'p1', w.projectId, { name: ['Show', 'Show 2'] });
		expect(await w.transport.push([renamed])).toEqual({
			outcome: 'refused',
			refusals: [{ entryId: renamed.entryId, reason: 'invalid', message: expect.stringContaining('Flow Production Tracking') }]
		});
		expect((await w.transport.push([del('project', 'p1', w.projectId)])).outcome).toBe('applied');
		expect(w.fpt.requests).toEqual([]);
		expect(w.fpt.live('Project').length).toBe(1);
	});
});

describe('push, refused', () => {
	// corpus findings/127_retry_and_client_uuid.md: 400 code 104, inside a batch too, and the batch rolls back.
	it('answers a create whose client UUID is there as a duplicate, and names only that one', async () => {
		const w = world();
		await applied(w, [create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId })]);
		const again = create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId });
		const fresh = create('camera', 'c2', { projectId: 'p1', cameraModel: 'B' }, { p1: w.projectId });
		expect(await w.transport.push([fresh, again])).toEqual({ outcome: 'refused', refusals: [{ entryId: again.entryId, reason: 'duplicate' }] });
		expect(w.fpt.live('Camera').length).toBe(1);
		expect(await w.transport.lookup([{ table: 'camera', id: 'c1' }])).toEqual([{ table: 'camera', id: 'c1', remoteId: w.fpt.byUuid('Camera', 'c1')!.id }]);
	});

	// Unmeasured: whether a retired row keeps its value. If the server says "not unique" and no row is found, it is not a duplicate.
	it('does not call it a duplicate when no record holds the client UUID', async () => {
		const w = world();
		w.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', {
			status: 400,
			body: { errors: [{ status: 400, code: 104, title: 'Create failed for [Camera]: The value for the Onset UUID field is required to be unique. <br> ' }] }
		});
		const one = create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId });
		expect(await w.transport.push([one])).toEqual({
			outcome: 'refused',
			refusals: [{ entryId: one.entryId, reason: 'invalid', message: expect.stringContaining('unique') }]
		});
	});

	it('answers an update or a delete of a record that is gone as gone', async () => {
		const w = world();
		const ids = await shoot(w);
		w.fpt.rows.get(`CustomEntity09:${ids.t1}`)!.retired = true;
		const edit = update('take', 't1', ids.t1, { tStop: [2.8, 4] });
		const other = update('slate', 's1', ids.s1, { notes: [undefined, 'x'] });
		// corpus recipes/002: 404 "Entity of type [X] with id=N does not exist.", and nothing in the batch is applied.
		expect(await w.transport.push([other, edit])).toEqual({ outcome: 'refused', refusals: [{ entryId: edit.entryId, reason: 'gone' }] });
		expect(w.fpt.byUuid('Slate', 's1')!.values.sg_set_notes).toBeUndefined();
		const gone = del('take', 't1', ids.t1);
		expect(await w.transport.push([gone])).toEqual({ outcome: 'refused', refusals: [{ entryId: gone.entryId, reason: 'gone' }] });
	});

	// corpus findings/143_nonadmin_rows.md: an Artist may not create, edit or delete custom-entity
	// rows; each refusal is 400 code 104 naming the type or the field.
	it('says plainly what this account may not do, and pauses that kind of change', async () => {
		const w = world();
		const ids = await shoot(w);
		w.fpt.forbidden.add('create:CustomEntity09');
		const first = create('take', 't2', { slateId: 's1', take: '2' }, { s1: ids.s1 });
		const message = "This Flow PT account can't create Takes. Ask an Admin for the permission.";
		expect(await w.transport.push([first])).toEqual({ outcome: 'refused', refusals: [{ entryId: first.entryId, reason: 'invalid', message }] });
		// The next take is not sent: the answer would be the same.
		const sentBefore = batches(w).length;
		const second = create('take', 't3', { slateId: 's1', take: '3' }, { s1: ids.s1 });
		expect(await w.transport.push([second])).toEqual({ outcome: 'refused', refusals: [{ entryId: second.entryId, reason: 'invalid', message }] });
		expect(batches(w).length).toBe(sentBefore);
		// Other kinds still go.
		expect((await w.transport.push([update('slate', 's1', ids.s1, { notes: [undefined, 'x'] })])).outcome).toBe('applied');
	});

	it('words an update and a delete it may not make', async () => {
		const w = world();
		const ids = await shoot(w);
		w.fpt.forbidden.add('update:CustomEntity09');
		w.fpt.forbidden.add('delete:Slate');
		const edit = update('take', 't1', ids.t1, { tStop: [2.8, 4] });
		expect(await w.transport.push([edit])).toMatchObject({ outcome: 'refused', refusals: [{ reason: 'invalid', message: "This Flow PT account can't change Takes. Ask an Admin for the permission." }] });
		const gone = del('slate', 's1', ids.s1);
		expect(await w.transport.push([gone])).toMatchObject({ outcome: 'refused', refusals: [{ reason: 'invalid', message: "This Flow PT account can't delete Slates. Ask an Admin for the permission." }] });
	});

	// corpus findings/136_unique_scope_retired.md: a deleted row frees its client UUID; a revive
	// of it can fail. A record created again is a new row, never a revived one.
	it('creates a record again after its delete as a new row, and never revives one', async () => {
		const w = world();
		const ids = await shoot(w);
		await applied(w, [del('take', 't1', ids.t1)]);
		const again = await applied(w, [create('take', 't1', { slateId: 's1', take: '1' }, { s1: ids.s1 })]);
		expect(Object.values(again)[0]).not.toBe(ids.t1);
		expect(w.fpt.requests.some((r) => r.query.has('revive') || JSON.stringify(r.body ?? '').includes('revive'))).toBe(false);
	});

	it('refuses what it can see is wrong without sending anything', async () => {
		const w = world();
		const unknown = create('take', 't1', { slateId: 's1', mood: 'tense' }, { s1: 5 });
		const unlinked = create('take', 't2', { slateId: 's9' }, {});
		const fine = create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId });
		expect(await w.transport.push([fine, unknown, unlinked])).toEqual({
			outcome: 'refused',
			refusals: [
				{ entryId: unknown.entryId, reason: 'invalid', message: expect.stringContaining('take.mood') },
				{ entryId: unlinked.entryId, reason: 'invalid', message: expect.stringContaining('slateId') }
			]
		});
		expect(batches(w)).toEqual([]);
		const table = create('reel', 'r1', {});
		expect(await w.transport.push([table])).toMatchObject({ outcome: 'refused', refusals: [{ entryId: table.entryId, reason: 'invalid' }] });
	});

	// corpus field_types/entity.md: "Value is not legal" for an id that does not exist.
	it('names the operations that wrote the field a 400 blames', async () => {
		const w = world();
		const bad = create('slate', 's1', { shootDayId: 'd1', slateUID: '1' }, { d1: 424242 });
		const fine = create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId });
		expect(await w.transport.push([fine, bad])).toEqual({
			outcome: 'refused',
			refusals: [{ entryId: bad.entryId, reason: 'invalid', message: expect.stringContaining('Value is not legal') }]
		});
		expect(w.fpt.live('Camera')).toEqual([]);
	});

	it('names every operation when a 400 blames none', async () => {
		const w = world();
		w.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { status: 400, body: { errors: [{ status: 400, code: 103, title: 'Request Parameters invalid.' }] } });
		const a = create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId });
		const b = create('camera', 'c2', { projectId: 'p1', cameraModel: 'B' }, { p1: w.projectId });
		const result = await w.transport.push([a, b]);
		expect(result).toMatchObject({ outcome: 'refused' });
		expect(result.outcome === 'refused' && result.refusals.map((r) => [r.entryId, r.reason])).toEqual([
			[a.entryId, 'invalid'],
			[b.entryId, 'invalid']
		]);
	});
});

describe('push, no answer', () => {
	const camera = (w: World) => create('camera', 'c1', { projectId: 'p1', cameraModel: 'A' }, { p1: w.projectId });

	// corpus findings/127: an abandoned batch still commits.
	it('a batch that committed and never answered is a timeout; the lookup finds what landed', async () => {
		const w = world();
		w.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { after: 'network' });
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('timeout');
		const found = await w.transport.lookup([{ table: 'camera', id: 'c1' }]);
		expect(found).toEqual([{ table: 'camera', id: 'c1', remoteId: w.fpt.byUuid('Camera', 'c1')!.id }]);
	});

	it('offline is unreachable: nothing left', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		w.fpt.online = false;
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('unreachable');
		expect(await kindOf(w.transport.lookup([{ table: 'camera', id: 'c1' }]))).toBe('unreachable');
	});

	it('a read that never arrives while online is unreachable too: nothing was changed', async () => {
		const w = world();
		w.fpt.failNext((r) => r.path.endsWith('/_search'), 'network');
		expect(await kindOf(w.transport.lookup([{ table: 'camera', id: 'c1' }]))).toBe('unreachable');
	});

	it('a 401 is unauthorized', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		w.fpt.bearerValid = false;
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('unauthorized');
		expect(await kindOf(w.transport.read([{ table: 'camera', id: 'c1', remoteId: 1, keys: ['cameraModel'] }]))).toBe('unauthorized');
	});

	// corpus findings/133_bearer_expiry.md: a bearer past its exp is 401 code 102 `Token Expired`.
	it('mints a new bearer once when the site says the old one expired, and sends again', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		w.fpt.expired.add('spent');
		const asked: unknown[] = [];
		let held = 'spent';
		w.auth.bearer = async (request?: { renew?: boolean }) => {
			asked.push(request);
			if (request?.renew) held = BEARER;
			return held;
		};
		const result = await w.transport.push([camera(w)]);
		expect(result.outcome).toBe('applied');
		expect(w.fpt.live('Camera').length).toBe(1);
		expect(asked).toContainEqual({ renew: true });
		expect(batches(w).map((r) => r.headers.get('authorization'))).toEqual(['Bearer spent', `Bearer ${BEARER}`]);
	});

	it('retries an expired bearer once only', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		w.fpt.expired.add('spent');
		w.auth.bearer = async () => 'spent';
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('unauthorized');
		expect(batches(w).length).toBe(2);
	});

	it('takes a forged bearer as unauthorized, without minting', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		const asked: unknown[] = [];
		w.auth.bearer = async (request?: { renew?: boolean }) => {
			asked.push(request);
			return 'forged';
		};
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('unauthorized');
		expect(batches(w).length).toBe(1);
		expect(asked).not.toContainEqual({ renew: true });
	});

	// findings/133: the bearer still worked 20 s before its exp. Renewed a minute before.
	it('renews a bearer close to its exp before sending it', async () => {
		const w = world();
		const late = jwtWith({ exp: Math.floor(w.fpt.clock.t / 1000) + 30 });
		w.auth.bearer = async (request?: { renew?: boolean }) => (request?.renew ? BEARER : late);
		expect((await w.transport.push([camera(w)])).outcome).toBe('applied');
		expect(w.fpt.requests.some((r) => r.headers.get('authorization') === `Bearer ${late}`)).toBe(false);
	});

	// corpus findings/126_session_idle.md: the token endpoint refuses a session with 400 code 102.
	it('a session the site refuses is unauthorized, wherever the 400 code 102 comes from', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		const refusal = { errors: [{ status: 400, code: 102, title: "Can't authenticate session token ending with '0000'" }] };
		w.auth.bearer = async () => {
			throw Object.assign(new Error('refused'), { status: 400, body: refusal });
		};
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('unauthorized');
		w.auth.bearer = async () => BEARER;
		w.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { status: 400, body: refusal });
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('unauthorized');
		expect(w.fpt.live('Camera')).toEqual([]);
	});

	it('signed out is unauthorized; a bearer that cannot be fetched is unreachable', async () => {
		const w = world();
		w.auth.bearer = async () => {
			throw new Error('Not signed in to Flow PT.');
		};
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('unauthorized');
		w.auth.bearer = async () => {
			throw new TypeError('Failed to fetch');
		};
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('unreachable');
	});

	// corpus findings/128_rate_limit.md: no limit was seen; 429 and 503 are retried with backoff.
	it('a 5xx or a 429 is a passing failure', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		for (const status of [500, 503, 429]) {
			w.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { status });
			expect(await kindOf(w.transport.push([camera(w)])), String(status)).toBe('failed');
		}
		w.fpt.failNext((r) => r.path.endsWith('/_search'), { status: 502, body: '<html>Bad Gateway</html>' });
		expect(await kindOf(w.transport.lookup([{ table: 'camera', id: 'c1' }]))).toBe('failed');
		expect(w.fpt.live('Camera')).toEqual([]);
	});

	it('a gateway that gave up on a batch may have let it through: a timeout', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		w.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { status: 504, body: '<html>Gateway Timeout</html>' });
		expect(await kindOf(w.transport.push([camera(w)]))).toBe('timeout');
	});

	it('an aborted call is a timeout', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		const controller = new AbortController();
		controller.abort();
		expect(await kindOf(w.transport.push([camera(w)], controller.signal))).toBe('timeout');
	});
});

describe('lookup', () => {
	it('finds records by client UUID, across tables, and leaves out the ones the server lacks', async () => {
		const w = world();
		const ids = await shoot(w);
		const found = await w.transport.lookup([
			{ table: 'take', id: 't1' },
			{ table: 'take', id: 't-none' },
			{ table: 'slate', id: 's1' },
			{ table: 'project', id: 'p1' }
		]);
		expect(found).toEqual(
			expect.arrayContaining([
				{ table: 'take', id: 't1', remoteId: ids.t1 },
				{ table: 'slate', id: 's1', remoteId: ids.s1 },
				{ table: 'project', id: 'p1', remoteId: w.projectId }
			])
		);
		expect(found.length).toBe(3);
	});

	// corpus findings/127: uniqueness and the `is` filter both ignore case.
	it('matches whatever the case the server holds', async () => {
		const w = world();
		const id = w.fpt.seed('Camera', { sg_onset_uuid: 'ABC-1' });
		expect(await w.transport.lookup([{ table: 'camera', id: 'abc-1' }])).toEqual([{ table: 'camera', id: 'abc-1', remoteId: id }]);
	});

	it('asks once per table, in the vendor content type', async () => {
		const w = world();
		await w.transport.lookup([{ table: 'camera', id: 'warm' }]);
		w.fpt.requests.length = 0;
		await w.transport.lookup([
			{ table: 'camera', id: 'c1' },
			{ table: 'camera', id: 'c2' },
			{ table: 'lens', id: 'l1' }
		]);
		expect(w.fpt.requests.map((r) => r.path)).toEqual(['/api/v1/entity/cameras/_search', '/api/v1/entity/custom_entity19s/_search']);
		// corpus endpoints/post_entity_type_search.md: application/json is a 415.
		expect(w.fpt.requests[0].headers.get('content-type')).toMatch(/^application\/vnd\+shotgun\.api3_(array|hash)\+json$/);
	});
});

describe('read', () => {
	it('gives the server values of the keys asked, in our form', async () => {
		const w = world();
		const ids = await shoot(w);
		w.fpt.rows.get(`CustomEntity09:${ids.t1}`)!.values.sg_focus_distance_m = 1_000_000_000;
		const records = await w.transport.read([
			{ table: 'take', id: 't1', remoteId: ids.t1, keys: ['tStop', 'focusDistance', 'circleTake', 'take', 'slateId', 'lensId'] },
			{ table: 'slate', id: 's1', remoteId: ids.s1, keys: ['slateUID', 'shootDayId'] }
		]);
		expect(records).toEqual(
			expect.arrayContaining([
				{ table: 'take', id: 't1', remoteId: ids.t1, fields: { tStop: 2.8, focusDistance: { m: 'inf' }, take: '1', slateId: 's1' } },
				{ table: 'slate', id: 's1', remoteId: ids.s1, fields: { slateUID: '42A', shootDayId: 'd1' } }
			])
		);
	});

	it('leaves out a record the server no longer has', async () => {
		const w = world();
		const ids = await shoot(w);
		w.fpt.rows.get(`CustomEntity09:${ids.t1}`)!.retired = true;
		expect(await w.transport.read([{ table: 'take', id: 't1', remoteId: ids.t1, keys: ['tStop'] }])).toEqual([]);
	});

	it('finds the record by client UUID when it has no server id yet', async () => {
		const w = world();
		const ids = await shoot(w);
		expect(await w.transport.read([{ table: 'take', id: 't1', keys: ['tStop'] }])).toEqual([{ table: 'take', id: 't1', remoteId: ids.t1, fields: { tStop: 2.8 } }]);
	});

	it('reads the name of the project', async () => {
		const w = world();
		expect(await w.transport.read([{ table: 'project', id: 'p1', remoteId: w.projectId, keys: ['name'] }])).toEqual([
			{ table: 'project', id: 'p1', remoteId: w.projectId, fields: { name: 'Show' } }
		]);
	});
});

// ---------------------------------------------------------------------------------- uploads

const photo = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });

async function still(w: World, id = 'ph1', fields: Record<string, unknown> = {}) {
	const ids = w.fpt.byUuid('CustomEntity09', 't1') ? { t1: w.fpt.byUuid('CustomEntity09', 't1')!.id } : await shoot(w);
	const made = create('still', id, { takeId: 't1', capturedAt: '2026-11-11T09:01:02.000Z', ...fields }, { t1: ids.t1 });
	const remote = (await applied(w, [made]))[made.entryId];
	const ref = (size: number, blobId = `b-${id}`): BlobRef => ({ table: 'still', recordId: id, blobId, size, type: 'image/jpeg', recordRemoteId: remote });
	return { take: ids.t1 as number, remote, ref };
}

/** Sends a file the way the runner does: part by part, in order. */
async function send(w: World, ref: BlobRef, session?: UploadSession): Promise<{ session: UploadSession; parts: SentPart[]; remoteId?: RemoteId }> {
	const s = session ?? (await w.transport.beginUpload(ref));
	const size = s.partSize ?? ref.size;
	const parts: SentPart[] = [];
	for (let start = 0, index = 0; start < ref.size || index === 0; start += size, index++) {
		parts.push(await w.transport.uploadPart(s, { index, data: photo(Math.min(size, ref.size - start)) }));
	}
	const done = await w.transport.finishUpload(s, parts);
	return { session: s, parts, ...(done.remoteId !== undefined ? { remoteId: done.remoteId } : {}) };
}

const stills = (w: World, take: number) => (w.fpt.rows.get(`CustomEntity09:${take}`)!.values.sg_photos as { id: number }[] | undefined) ?? [];
const attachments = (w: World) => w.fpt.live('Attachment');

describe('a still', () => {
	it('is created with no request: the server makes the Attachment at upload', async () => {
		const w = world();
		const ids = await shoot(w);
		w.fpt.requests.length = 0;
		const made = create('still', 'ph1', { takeId: 't1', capturedAt: '2026-11-11T09:01:02.000Z', caption: 'Chart' }, { t1: ids.t1 });
		const result = await w.transport.push([made]);
		expect(result).toEqual({
			outcome: 'applied',
			remoteIds: { [made.entryId]: encodeStillRemote({ take: ids.t1 as number, capturedAt: '2026-11-11T09:01:02.000Z', caption: 'Chart' }) }
		});
		expect(w.fpt.requests).toEqual([]);
		expect(attachments(w)).toEqual([]);
	});

	it('is refused when its take is not on the server', async () => {
		const w = world();
		const made = create('still', 'ph1', { takeId: 't1' }, {});
		expect(await w.transport.push([made])).toMatchObject({ outcome: 'refused', refusals: [{ entryId: made.entryId, reason: 'invalid' }] });
	});
});

describe('upload', () => {
	it('sends a photo in one PUT, as an Attachment in the stills field of its take', async () => {
		const w = world();
		const s = await still(w, 'ph1', { caption: 'Chart' });
		const ref = s.ref(1200);
		const session = await w.transport.beginUpload(ref);
		// corpus findings/125: a URL is good for 840 s.
		expect(session.expiresAt).toBe(w.fpt.clock.t + 840_000);
		expect(session.partSize).toBeUndefined();

		const sent = await send(w, ref, session);
		const [attachment] = attachments(w);
		expect(sent.remoteId).toBe(attachment.id);
		expect(attachment.values).toMatchObject({ filename: 'onset_ph1_b-ph1.jpg', display_name: 'Photo 2026-11-11T09:01:02.000Z', description: 'Chart' });
		expect(stills(w, s.take)).toEqual([{ type: 'Attachment', id: attachment.id }]);
		expect(await w.transport.verifyUpload(ref, sent.remoteId)).toEqual({ verified: true, remoteId: attachment.id });

		// corpus endpoints/put_links_upload.md: no Authorization on the presigned host.
		const put = w.fpt.requests.find((r) => r.host === 'storage' && r.method === 'PUT')!;
		expect(put.headers.has('authorization')).toBe(false);
		expect(put.headers.get('content-type')).toBe('image/jpeg');
		const init = w.fpt.requests.find((r) => r.path.endsWith('/_upload') && r.method === 'GET')!;
		expect(init.path).toBe(`/api/v1/entity/custom_entity09s/${s.take}/sg_photos/_upload`);
		expect(init.query.get('filename')).toBe('onset_ph1_b-ph1.jpg');
		expect(init.query.get('multipart_upload')).toBeNull();
	});

	// corpus findings/044_multipart_upload.md.
	it('sends a large file in parts and completes with the ETag of each, in order', async () => {
		const w = world({ upload: { singlePutMax: 10, partSize: 6 } });
		w.fpt.partFloor = 6;
		const s = await still(w);
		const ref = s.ref(16);
		const session = await w.transport.beginUpload(ref);
		expect(session.partSize).toBe(6);
		const sent = await send(w, ref, session);
		expect(sent.parts.map((p) => p.index)).toEqual([0, 1, 2]);
		expect(sent.parts.every((p) => p.etag && !p.etag.includes('"'))).toBe(true);
		const puts = w.fpt.requests.filter((r) => r.host === 'storage' && r.method === 'PUT');
		expect(puts.map((r) => [r.query.get('partNumber'), (r.raw as Blob).size])).toEqual([
			['1', 6],
			['2', 6],
			['3', 4]
		]);
		const completion = w.fpt.requests.find((r) => r.path.endsWith('/_upload') && r.method === 'POST')!;
		expect((completion.body as { upload_info: { etags: string[] } }).upload_info.etags).toEqual(sent.parts.map((p) => p.etag));
		expect(await w.transport.verifyUpload(ref, sent.remoteId)).toEqual({ verified: true, remoteId: attachments(w)[0].id });
		expect(stills(w, s.take).length).toBe(1);
	});

	// corpus findings/125: a PUT past 900 s is a 403 "Request has expired", in XML.
	it('says expired when the URL is dead; a renewed single PUT goes through', async () => {
		const w = world();
		const s = await still(w);
		const ref = s.ref(500);
		const session = await w.transport.beginUpload(ref);
		w.fpt.clock.t += 16 * 60_000;
		expect(await kindOf(w.transport.uploadPart(session, { index: 0, data: photo(500) }))).toBe('expired');
		const renewed = await w.transport.renewUpload(session);
		expect(renewed.expiresAt).toBe(w.fpt.clock.t + 840_000);
		const sent = await send(w, ref, renewed);
		expect(await w.transport.verifyUpload(ref, sent.remoteId)).toMatchObject({ verified: true });
		expect(attachments(w).length).toBe(1);
	});

	it('renews a multipart upload mid-way and keeps the parts already sent', async () => {
		const w = world({ upload: { singlePutMax: 10, partSize: 6 } });
		w.fpt.partFloor = 6;
		const s = await still(w);
		const ref = s.ref(16);
		let session = await w.transport.beginUpload(ref);
		const parts: SentPart[] = [await w.transport.uploadPart(session, { index: 0, data: photo(6) })];

		// The second part fails once, then its URL goes stale while the set waits.
		w.fpt.failNext((r) => r.host === 'storage' && r.method === 'PUT', { status: 500, body: '<Error/>' });
		expect(await kindOf(w.transport.uploadPart(session, { index: 1, data: photo(6) }))).toBe('failed');
		w.fpt.clock.t += 16 * 60_000;
		expect(await kindOf(w.transport.uploadPart(session, { index: 1, data: photo(6) }))).toBe('expired');

		session = await w.transport.renewUpload(session);
		expect(session.expiresAt).toBe(w.fpt.clock.t + 840_000);
		expect(session.partSize).toBe(6);
		parts.push(await w.transport.uploadPart(session, { index: 1, data: photo(6) }));
		parts.push(await w.transport.uploadPart(session, { index: 2, data: photo(4) }));
		const done = await w.transport.finishUpload(session, parts);

		// One upload, one first part: nothing started again.
		expect(w.fpt.count((r) => r.path.endsWith('/_upload') && r.method === 'GET')).toBe(1);
		expect(w.fpt.count((r) => r.host === 'storage' && r.method === 'PUT' && r.query.get('partNumber') === '1')).toBe(1);
		expect(await w.transport.verifyUpload(ref, done.remoteId)).toMatchObject({ verified: true });
		expect([...w.fpt.objects.values()].map((o) => [...o.values()])).toEqual([[6, 6, 4]]);
	});

	it('says expired on renewal when a multipart upload cannot be continued, and lets go of it', async () => {
		const w = world({ upload: { singlePutMax: 10, partSize: 6 } });
		const s = await still(w);
		const session = await w.transport.beginUpload(s.ref(16));
		await w.transport.uploadPart(session, { index: 0, data: photo(6) });
		w.fpt.failNext((r) => r.path.endsWith('/_upload/multipart'), { status: 400, body: { errors: [{ status: 400, code: 103, title: 'Could not generate upload url. Check the site settings.' }] } });
		expect(await kindOf(w.transport.renewUpload(session))).toBe('expired');
		// corpus findings/044: an init neither completed nor aborted stays open on storage.
		expect(w.fpt.count((r) => r.path.endsWith('/multipart_abort'))).toBe(1);
	});

	// corpus findings/039_upload_silent_failures.md: a 201 proves nothing.
	it('an upload that answered and kept no bytes is not verified, and its empty row is removed', async () => {
		const w = world();
		const s = await still(w);
		const ref = s.ref(900);
		w.fpt.loseNextUpload = true;
		const lost = await send(w, ref);
		expect(attachments(w).length).toBe(1);
		expect(await w.transport.verifyUpload(ref, lost.remoteId)).toEqual({ verified: false });
		expect(attachments(w)).toEqual([]);
		expect(stills(w, s.take).filter((a) => w.fpt.rows.get(`Attachment:${a.id}`)?.retired !== true)).toEqual([]);

		const sent = await send(w, ref);
		expect(await w.transport.verifyUpload(ref, sent.remoteId)).toEqual({ verified: true, remoteId: attachments(w)[0].id });
		expect(attachments(w).length).toBe(1);
	});

	it('is not verified when the stored file is not the size sent', async () => {
		const w = world();
		const s = await still(w);
		const sent = await send(w, s.ref(900));
		expect(await w.transport.verifyUpload(s.ref(901), sent.remoteId)).toEqual({ verified: false });
		expect(attachments(w).length).toBe(1);
	});

	it('is not verified before anything was sent', async () => {
		const w = world();
		const s = await still(w);
		expect(await w.transport.verifyUpload(s.ref(900))).toEqual({ verified: false });
	});

	it('a completion that landed and never answered is a timeout; the check finds the file', async () => {
		const w = world();
		const s = await still(w);
		const ref = s.ref(700);
		const session = await w.transport.beginUpload(ref);
		const part = await w.transport.uploadPart(session, { index: 0, data: photo(700) });
		w.fpt.failNext((r) => r.path.endsWith('/_upload') && r.method === 'POST', { after: 'network' });
		expect(await kindOf(w.transport.finishUpload(session, [part]))).toBe('timeout');
		expect(await w.transport.verifyUpload(ref)).toEqual({ verified: true, remoteId: attachments(w)[0].id });
	});

	it('puts a photo back in the stills field when the check finds it unlinked', async () => {
		const w = world();
		const s = await still(w);
		const ref = s.ref(700);
		const sent = await send(w, ref);
		w.fpt.rows.get(`CustomEntity09:${s.take}`)!.values.sg_photos = [];
		expect(await w.transport.verifyUpload(ref, sent.remoteId)).toMatchObject({ verified: true });
		expect(stills(w, s.take)).toEqual([{ type: 'Attachment', id: sent.remoteId }]);
	});

	// corpus findings/134: a second upload to the multi-entity field adds. Nothing is put back.
	it('finishes an upload without reading or writing the stills field', async () => {
		const w = world();
		const a = await still(w, 'ph1');
		const first = await send(w, a.ref(300));
		const b = await still(w, 'ph2');
		const session = await w.transport.beginUpload(b.ref(400));
		const part = await w.transport.uploadPart(session, { index: 0, data: photo(400) });
		w.fpt.requests.length = 0;
		const done = await w.transport.finishUpload(session, [part]);
		expect(stills(w, a.take).map((x) => x.id)).toEqual([first.remoteId, done.remoteId]);
		expect(w.fpt.requests.filter((r) => r.path.includes('custom_entity09s')).map((r) => r.method + ' ' + r.path)).toEqual([`POST /api/v1/entity/custom_entity09s/${a.take}/sg_photos/_upload`]);
	});

	// corpus findings/141: the stored type is what the PUT sent, else `binary/octet-stream`.
	it("sends the photo's own type, even for bytes that carry none", async () => {
		const w = world();
		const s = await still(w);
		const ref = s.ref(300);
		const session = await w.transport.beginUpload(ref);
		const part = await w.transport.uploadPart(session, { index: 0, data: new Blob([new Uint8Array(300)]) });
		await w.transport.finishUpload(session, [part]);
		const put = w.fpt.requests.find((r) => r.host === 'storage' && r.method === 'PUT')!;
		expect(put.headers.get('content-type')).toBe('image/jpeg');
		expect([...w.fpt.storedTypes.values()]).toEqual(['image/jpeg']);
	});

	// corpus findings/140: one PUT took 1000 MB. Parts only above 32 MiB, for resuming on set Wi-Fi.
	it('sends up to 32 MiB in one PUT, and more in parts', async () => {
		const w = world();
		const s = await still(w);
		const MiB = 1024 * 1024;
		expect((await w.transport.beginUpload(s.ref(32 * MiB))).partSize).toBeUndefined();
		expect((await w.transport.beginUpload(s.ref(32 * MiB + 1))).partSize).toBe(8 * MiB);
	});

	// corpus findings/141: HEAD on the stored file is 403. The check reads the size from a GET.
	it('checks an upload with a GET, never a HEAD', async () => {
		const w = world();
		const s = await still(w);
		const sent = await send(w, s.ref(300));
		expect(await w.transport.verifyUpload(s.ref(300), sent.remoteId)).toMatchObject({ verified: true });
		expect(w.fpt.requests.filter((r) => r.host === 'storage').map((r) => r.method)).toEqual(['PUT', 'GET']);
	});

	it('several photos of one take are each their own Attachment', async () => {
		const w = world();
		const a = await still(w, 'ph1');
		const b = await still(w, 'ph2');
		const one = await send(w, a.ref(300));
		const two = await send(w, b.ref(400));
		expect(stills(w, a.take).length).toBe(2);
		expect(await w.transport.verifyUpload(a.ref(300), one.remoteId)).toEqual({ verified: true, remoteId: one.remoteId });
		expect(await w.transport.verifyUpload(b.ref(400), two.remoteId)).toEqual({ verified: true, remoteId: two.remoteId });
	});

	it('fails a part the storage refuses, and is unreachable offline', async () => {
		const w = world();
		const s = await still(w);
		const session = await w.transport.beginUpload(s.ref(500));
		w.fpt.failNext((r) => r.host === 'storage', { status: 503, body: '<Error/>' });
		expect(await kindOf(w.transport.uploadPart(session, { index: 0, data: photo(500) }))).toBe('failed');
		w.fpt.online = false;
		expect(await kindOf(w.transport.uploadPart(session, { index: 0, data: photo(500) }))).toBe('unreachable');
	});

	it('cannot upload a file whose still has no take on the server', async () => {
		const w = world();
		expect(await kindOf(w.transport.beginUpload({ table: 'still', recordId: 'ph1', blobId: 'b1', size: 10, type: 'image/jpeg' }))).toBe('failed');
		expect(await kindOf(w.transport.beginUpload({ table: 'take', recordId: 't1', blobId: 'b1', size: 10, type: 'image/jpeg', recordRemoteId: 5 }))).toBe('failed');
	});

	it('never keeps a URL: the session token is not part of what the runner stores', async () => {
		const w = world();
		const s = await still(w);
		const sent = await send(w, s.ref(300));
		expect(typeof sent.remoteId).toBe('number');
		expect(JSON.stringify(sent.remoteId)).not.toContain(STORAGE);
		expect(String(s.remote)).not.toContain('http');
	});
});

describe('a still, after its upload', () => {
	it('is found by client UUID, with the take it hangs on', async () => {
		const w = world();
		const s = await still(w);
		expect(await w.transport.lookup([{ table: 'still', id: 'ph1' }])).toEqual([]);
		await send(w, s.ref(300));
		w.fpt.requests.length = 0;
		expect(await w.transport.lookup([{ table: 'still', id: 'ph1' }])).toEqual([
			{ table: 'still', id: 'ph1', remoteId: encodeStillRemote({ take: s.take, capturedAt: '2026-11-11T09:01:02.000Z' }) }
		]);
		// corpus findings/134: the Attachment names its take in `attachment_links`. One search.
		expect(w.fpt.requests.map((r) => r.path)).toEqual(['/api/v1/entity/attachments/_search']);
	});

	it('takes a caption, gives it back, and is deleted with its Attachment', async () => {
		const w = world();
		const s = await still(w);
		await send(w, s.ref(300));
		await applied(w, [update('still', 'ph1', s.remote, { caption: [undefined, 'Grey ball'] })]);
		expect(attachments(w)[0].values.description).toBe('Grey ball');
		expect(await w.transport.read([{ table: 'still', id: 'ph1', remoteId: s.remote, keys: ['caption', 'capturedAt'] }])).toEqual([
			{ table: 'still', id: 'ph1', remoteId: s.remote, fields: { caption: 'Grey ball', capturedAt: '2026-11-11T09:01:02.000Z' } }
		]);
		await applied(w, [del('still', 'ph1', s.remote)]);
		expect(attachments(w)).toEqual([]);
		expect(await w.transport.lookup([{ table: 'still', id: 'ph1' }])).toEqual([]);
	});

	it('with no Attachment is gone', async () => {
		const w = world();
		const s = await still(w);
		const edit = update('still', 'ph1', s.remote, { caption: [undefined, 'x'] });
		expect(await w.transport.push([edit])).toEqual({ outcome: 'refused', refusals: [{ entryId: edit.entryId, reason: 'gone' }] });
		expect(await w.transport.read([{ table: 'still', id: 'ph1', remoteId: s.remote, keys: ['caption'] }])).toEqual([]);
	});
});
