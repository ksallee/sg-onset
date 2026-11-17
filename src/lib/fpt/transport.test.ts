import { describe, expect, it } from 'vitest';
import { TransportError, type BlobRef, type PushOp, type SentPart, type UploadSession } from '$lib/outbox/transport';
import type { Op, RemoteId } from '$lib/outbox/types';
import { memoryKeyValue, resolutionKey } from './cache';
import { BEARER, fakeFpt, STORAGE } from './fakeFpt';
import { encodeStillRemote } from './stills';
import { jwtWith } from './testkit';
import { createFptTransport, readShotCodes, type ShotResult } from './transport';

type World = ReturnType<typeof world>;

/** The Set Shot entity of the fake site (testkit.ts). */
const SET_SHOT = 'CustomEntity22';

function world(options: { fields?: 'complete' | 'bare'; upload?: { singlePutMax: number; partSize: number } } = {}) {
	const fpt = fakeFpt({ fields: options.fields });
	const projectId = fpt.seed('Project', { name: 'Show' });
	const cache = memoryKeyValue();
	const auth = { bearer: async (_request?: { renew?: boolean }): Promise<string> => BEARER };
	/** What each push read of the slates whose codes it touched, in order. */
	const shotNews: ShotResult[][] = [];
	const make = () =>
		createFptTransport({
			site: fpt.site,
			bearer: (request) => auth.bearer(request),
			fetch: fpt.fetch,
			schemaCache: cache,
			projectId,
			now: () => fpt.clock.t,
			online: () => fpt.online,
			onShots: (results) => void shotNews.push(results),
			...(options.upload ? { upload: options.upload } : {})
		});
	return { fpt, projectId, cache, auth, make, shotNews, transport: make() };
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
		// /schema, the nine types, Attachment and Shot, where the photos and Shots fields add one each
		// (findings/142), Version, where videos go, and Note, where the Notes on Shots are keyed (#97).
		expect(reads()).toBe(14);
		await applied(w, [create('camera', 'c2', { projectId: 'p1', cameraModel: 'B' }, { p1: w.projectId })]);
		expect(reads()).toBe(14);
		expect(await w.cache.get(resolutionKey(w.fpt.site))).toBeDefined();
		// Another session on the same device starts from the cache.
		await w.make().push([create('camera', 'c3', { projectId: 'p1', cameraModel: 'C' }, { p1: w.projectId })]);
		expect(reads()).toBe(14);
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

// A slate's Set Shots and Shots, worked out from its VFX shot codes (setShots.ts). Links to Shots
// are made on the Set Shot only, by the app's match once or by a person; the slate's own fields are
// derived from them (Kevin, #102). Shot codes are not unique and Shot reads need a project filter
// (entity_types/Shot.md); writes put the mode in the body, never a bare list (recipes/009).
describe('push, the Set Shots and Shots of a slate', () => {
	type Ref = { type: string; id: number };
	async function day(w: World): Promise<number> {
		const level = create('shootDay', 'd1', { projectId: 'p1', shootDate: '2026-11-11' }, { p1: w.projectId });
		return Number((await applied(w, [level]))[level.entryId]);
	}
	function shots(w: World) {
		const other = w.fpt.seed('Project', { name: 'Other' });
		return {
			a: w.fpt.seed('Shot', { code: 'SMP_012_0010', project: { type: 'Project', id: w.projectId } }),
			b: w.fpt.seed('Shot', { code: 'SMP_012_0020', project: { type: 'Project', id: w.projectId } }),
			c: w.fpt.seed('Shot', { code: 'SMP_042_0010', project: { type: 'Project', id: w.projectId } }),
			elsewhere: w.fpt.seed('Shot', { code: 'SMP_099_0010', project: { type: 'Project', id: other } })
		};
	}
	const ids = (value: unknown) => ((value as Ref[] | undefined) ?? []).map((r) => r.id).sort((x, y) => x - y);
	const shotsField = (w: World, uuid: string) => ids(w.fpt.byUuid('Slate', uuid)!.values.sg_shots);
	const setShotsField = (w: World, uuid: string) => ids(w.fpt.byUuid('Slate', uuid)!.values.sg_set_shots);
	const setShotOf = (w: World, code: string) => w.fpt.live(SET_SHOT).find((r) => r.values.sg_onset_key === `${w.projectId}:${code.trim().toLowerCase()}`);
	const writes = (w: World) => w.fpt.requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/api/v1/entity/slates/'));
	const setShotWrites = (w: World) =>
		w.fpt.requests.filter((r) => (r.method === 'PUT' && r.path.startsWith('/api/v1/entity/custom_entity22s/')) || (r.path === '/api/v1/entity/_batch' && JSON.stringify(r.body).includes('"update","entity":"CustomEntity22"')));
	const shotSearches = (w: World) => w.fpt.requests.filter((r) => r.path === '/api/v1/entity/shots/_search');
	const setShotSearches = (w: World) => w.fpt.requests.filter((r) => r.path === '/api/v1/entity/custom_entity22s/_search');
	const slate = (id: string, d1: number, codes?: string[]) => create('slate', id, { shootDayId: 'd1', slateUID: id.toUpperCase(), ...(codes ? { vfxShots: codes } : {}) }, { d1 });
	const pushed = async (w: World, o: PushOp) => Number((await applied(w, [o]))[o.entryId]);

	it('files a Set Shot per code typed, in the project, named as typed, with its key, in one batch', async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		const batches0 = batches(w).length;
		await applied(w, [slate('s1', d1, ['smp_012_0010', 'SMP_099_0010'])]);
		const a = setShotOf(w, 'SMP_012_0010')!;
		const none = setShotOf(w, 'SMP_099_0010')!;
		expect(a.values).toMatchObject({ project: { type: 'Project', id: w.projectId }, code: 'smp_012_0010', sg_onset_key: `${w.projectId}:smp_012_0010` });
		expect(none.values).toMatchObject({ code: 'SMP_099_0010', sg_onset_key: `${w.projectId}:smp_099_0010` });
		expect(w.fpt.live(SET_SHOT)).toHaveLength(2);
		// The slate's batch, one batch for both Set Shots, one batch for the match.
		expect(batches(w).length - batches0).toBe(3);
		expect(batches(w)[batches0 + 1].body).toEqual({
			requests: [
				{ request_type: 'create', entity: SET_SHOT, data: { project: { type: 'Project', id: w.projectId }, code: 'smp_012_0010', sg_onset_key: `${w.projectId}:smp_012_0010` } },
				{ request_type: 'create', entity: SET_SHOT, data: { project: { type: 'Project', id: w.projectId }, code: 'SMP_099_0010', sg_onset_key: `${w.projectId}:smp_099_0010` } }
			]
		});
		expect(setShotSearches(w)[0].body).toMatchObject({
			filters: { logical_operator: 'and', conditions: [['project', 'is', { type: 'Project', id: w.projectId }], ['sg_onset_key', 'in', [`${w.projectId}:smp_012_0010`, `${w.projectId}:smp_099_0010`]]] }
		});
		// Shot reads need a project filter of their own (entity_types/Shot.md). The codes come from the keys.
		expect(shotSearches(w)[0].body).toMatchObject({ filters: { logical_operator: 'and', conditions: [['project', 'is', { type: 'Project', id: w.projectId }], ['code', 'in', ['smp_012_0010', 'smp_099_0010']]] } });
		// Linked from the slate. The one a Shot has is matched at once; the other holds the code.
		expect(setShotsField(w, 's1')).toEqual([a.id, none.id]);
		expect(ids(a.values.sg_shots)).toEqual([s.a]);
		expect(ids(none.values.sg_shots)).toEqual([]);
		expect(shotsField(w, 's1')).toEqual([s.a]);
		expect(w.fpt.byUuid('Slate', 's1')!.values.sg_vfx_shots).toBe('smp_012_0010, SMP_099_0010');
		expect(w.shotNews).toEqual([[{ slate: 's1', several: [], shots: [s.a] }]]);
		// The app never makes a Shot.
		expect(w.fpt.live('Shot')).toHaveLength(4);
	});

	// Kevin, #102: the app matches a Set Shot once, and a flag on it in Flow PT records it. Both
	// land in one batch, in order (findings/154).
	it('matches a Set Shot to every Shot of its code, and flags it in the same batch', async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		const twin = w.fpt.seed('Shot', { code: 'smp_012_0010', project: { type: 'Project', id: w.projectId } });
		await applied(w, [slate('s1', d1, ['SMP_012_0010'])]);
		const set = setShotOf(w, 'SMP_012_0010')!;
		expect(setShotWrites(w).map((r) => r.body)).toEqual([
			{
				requests: [
					{ request_type: 'update', entity: SET_SHOT, record_id: set.id, data: { sg_shots: { multi_entity_update_mode: 'add', value: [{ type: 'Shot', id: s.a }, { type: 'Shot', id: twin }] } } },
					{ request_type: 'update', entity: SET_SHOT, record_id: set.id, data: { sg_onset_matched: true } }
				]
			}
		]);
		expect(set.values.sg_onset_matched).toBe(true);
		// Shot codes are not unique (entity_types/Shot.md). Kevin, #96: all are linked, and the code is named.
		expect(shotsField(w, 's1')).toEqual([s.a, twin]);
		expect(w.shotNews.at(-1)).toEqual([{ slate: 's1', several: ['SMP_012_0010'], shots: [s.a, twin] }]);
	});

	it('sets the slate fields whole, with the mode in the body, one field a write', async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		await applied(w, [slate('s1', d1, ['SMP_012_0010'])]);
		const set = setShotOf(w, 'SMP_012_0010')!;
		expect(writes(w).map((r) => r.body)).toEqual([
			{ sg_set_shots: { multi_entity_update_mode: 'set', value: [{ type: SET_SHOT, id: set.id }] } },
			{ sg_shots: { multi_entity_update_mode: 'set', value: [{ type: 'Shot', id: s.a }] } }
		]);
		expect(writes(w).every((r) => r.query.toString() === '')).toBe(true);
	});

	it('never matches a Set Shot again: one a person emptied after a match stays empty, on any device', async () => {
		const w = world();
		const d1 = await day(w);
		shots(w);
		const s1 = await pushed(w, slate('s1', d1, ['SMP_012_0010']));
		const set = setShotOf(w, 'SMP_012_0010')!;
		// The match was wrong: someone empties the Set Shot. Another iPad syncs a slate with the code.
		set.values.sg_shots = [];
		const other = w.make();
		const o = slate('s2', d1, ['SMP_012_0010']);
		const result = await other.push([o]);
		if (result.outcome !== 'applied') throw new Error('refused');
		const s2 = Number(result.remoteIds[o.entryId]);
		expect(ids(set.values.sg_shots)).toEqual([]);
		expect(setShotsField(w, 's2')).toEqual([set.id]);
		expect(shotsField(w, 's2')).toEqual([]);
		// The first slate's Shots follow its Set Shot at the next sync.
		expect(await other.linkShots([{ slate: 's1', remoteId: s1, codes: ['SMP_012_0010'] }, { slate: 's2', remoteId: s2, codes: ['SMP_012_0010'] }])).toEqual([
			{ slate: 's1', several: [], shots: [] },
			{ slate: 's2', several: [], shots: [] }
		]);
		expect(shotsField(w, 's1')).toEqual([]);
		expect(ids(set.values.sg_shots)).toEqual([]);
	});

	// Kevin, #102: anyone sets a Set Shot's Shots in Flow PT's grid, which covers the time after wrap.
	it('leaves alone a Set Shot a person filled, and links the slate to its Shots, whatever their codes', async () => {
		const w = world();
		const d1 = await day(w);
		const s1 = await pushed(w, slate('s1', d1, ['SMP_012_0010']));
		const set = setShotOf(w, 'SMP_012_0010')!;
		// Editorial cut the shot in two, under new codes. Someone sets both on the Set Shot.
		const left = w.fpt.seed('Shot', { code: 'SMP_012_0010A', project: { type: 'Project', id: w.projectId } });
		const right = w.fpt.seed('Shot', { code: 'SMP_012_0010B', project: { type: 'Project', id: w.projectId } });
		set.values.sg_shots = [
			{ type: 'Shot', id: left },
			{ type: 'Shot', id: right }
		];
		const writes0 = setShotWrites(w).length;
		expect(await w.transport.linkShots([{ slate: 's1', remoteId: s1, codes: ['SMP_012_0010'] }])).toEqual([{ slate: 's1', several: [], shots: [left, right] }]);
		expect(shotsField(w, 's1')).toEqual([left, right]);
		expect(setShotWrites(w).length).toBe(writes0);
		expect(set.values.sg_onset_matched).toBeUndefined();
	});

	it('links a late Shot at a later sync, through the Set Shot', async () => {
		const w = world();
		const d1 = await day(w);
		const s1 = await pushed(w, slate('s1', d1, ['SMP_012_0010', 'SMP_042_0010']));
		expect(shotsField(w, 's1')).toEqual([]);
		// A coordinator makes one of the Shots in Flow PT.
		const a = w.fpt.seed('Shot', { code: 'SMP_012_0010', project: { type: 'Project', id: w.projectId } });
		await w.transport.linkShots([{ slate: 's1', remoteId: s1, codes: ['SMP_012_0010', 'SMP_042_0010'] }]);
		expect(ids(setShotOf(w, 'SMP_012_0010')!.values.sg_shots)).toEqual([a]);
		expect(setShotOf(w, 'SMP_012_0010')!.values.sg_onset_matched).toBe(true);
		expect(setShotOf(w, 'SMP_042_0010')!.values.sg_onset_matched).toBeUndefined();
		expect(shotsField(w, 's1')).toEqual([a]);
		expect(w.fpt.live(SET_SHOT)).toHaveLength(2);
	});

	// Kevin, #102: the slate's Shots are derived. A link made by hand on the slate is overwritten.
	it("overwrites a link made by hand on the slate, and writes the slate only when it differs", async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		const s1 = await pushed(w, slate('s1', d1, ['SMP_012_0010']));
		const row = w.fpt.byUuid('Slate', 's1')!;
		row.values.sg_shots = [...(row.values.sg_shots as Ref[]), { type: 'Shot', id: s.c }];
		const writes0 = writes(w).length;
		await w.transport.linkShots([{ slate: 's1', remoteId: s1, codes: ['SMP_012_0010'] }]);
		expect(shotsField(w, 's1')).toEqual([s.a]);
		expect(writes(w).slice(writes0).map((r) => r.body)).toEqual([{ sg_shots: { multi_entity_update_mode: 'set', value: [{ type: 'Shot', id: s.a }] } }]);
		await w.transport.linkShots([{ slate: 's1', remoteId: s1, codes: ['SMP_012_0010'] }]);
		expect(writes(w).length).toBe(writes0 + 1);
	});

	it('on an edit, sets the Set Shots of the codes the slate holds and their Shots; the old Set Shot stays', async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		const s1 = await pushed(w, slate('s1', d1, ['SMP_012_0010']));
		const old = setShotOf(w, 'SMP_012_0010')!;
		await applied(w, [update('slate', 's1', s1, { vfxShots: [['SMP_012_0010'], ['SMP_012_0020']] })]);
		const next = setShotOf(w, 'SMP_012_0020')!;
		expect(setShotsField(w, 's1')).toEqual([next.id]);
		expect(shotsField(w, 's1')).toEqual([s.b]);
		expect(w.fpt.byUuid('Slate', 's1')!.values.sg_vfx_shots).toBe('SMP_012_0020');
		// Kevin, #102: the old Set Shot stays, with its Shot, even when no slate lists it.
		expect(setShotOf(w, 'SMP_012_0010')).toMatchObject({ id: old.id, values: { sg_shots: [{ type: 'Shot', id: s.a }] } });
		expect(w.fpt.requests.some((r) => r.method === 'DELETE' || (r.path === '/api/v1/entity/_batch' && JSON.stringify(r.body).includes('"delete"')))).toBe(false);
	});

	it('clears the Set Shots and Shots of a slate whose codes are cleared', async () => {
		const w = world();
		const d1 = await day(w);
		shots(w);
		const s1 = await pushed(w, slate('s1', d1, ['SMP_012_0010', 'SMP_042_0010']));
		await applied(w, [update('slate', 's1', s1, { vfxShots: [['SMP_012_0010', 'SMP_042_0010'], undefined] })]);
		expect(shotsField(w, 's1')).toEqual([]);
		expect(setShotsField(w, 's1')).toEqual([]);
		expect(w.shotNews.at(-1)).toEqual([{ slate: 's1', several: [], shots: [] }]);
	});

	it('asks nothing about Shots for a slate edit that leaves the codes alone', async () => {
		const w = world();
		const d1 = await day(w);
		const s1 = await pushed(w, slate('s1', d1));
		await applied(w, [update('slate', 's1', s1, { notes: [undefined, 'Wire work'] })]);
		expect(shotSearches(w)).toEqual([]);
		expect(setShotSearches(w)).toEqual([]);
		expect(writes(w)).toEqual([]);
		expect(w.shotNews).toEqual([]);
	});

	it('never files a second Set Shot for a code: another slate, another case, the same push', async () => {
		const w = world();
		const d1 = await day(w);
		shots(w);
		await applied(w, [slate('s1', d1, ['SMP_012_0010'])]);
		const set = setShotOf(w, 'SMP_012_0010')!.id;
		await applied(w, [slate('s2', d1, [' smp_012_0010', 'SMP_042_0010']), slate('s3', d1, ['SMP_042_0010'])]);
		expect(w.fpt.live(SET_SHOT)).toHaveLength(2);
		const other = setShotOf(w, 'SMP_042_0010')!.id;
		expect(setShotsField(w, 's2')).toEqual([set, other]);
		expect(setShotsField(w, 's3')).toEqual([other]);
	});

	it('keeps the Set Shots of each project apart', async () => {
		const w = world();
		const d1 = await day(w);
		const other = w.fpt.seed('Project', { name: 'Other' });
		const theirs = w.fpt.seed(SET_SHOT, { project: { type: 'Project', id: other }, code: 'SMP_012_0010', sg_onset_key: `${other}:smp_012_0010` });
		await applied(w, [slate('s1', d1, ['SMP_012_0010'])]);
		const ours = setShotOf(w, 'SMP_012_0010')!;
		expect(ours.id).not.toBe(theirs);
		expect(ours.values.project).toEqual({ type: 'Project', id: w.projectId });
	});

	it('links the Set Shot another device filed meanwhile, refused as not unique, with no second row', async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		// Between the lookup and the create, another device files the code.
		const real = w.fpt.fetch;
		let theirs = 0;
		w.fpt.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			if (!theirs && String(input).endsWith('/entity/_batch') && String(init?.body).includes('"create","entity":"CustomEntity22"')) {
				theirs = w.fpt.seed(SET_SHOT, { project: { type: 'Project', id: w.projectId }, code: 'SMP_012_0010', sg_onset_key: `${w.projectId}:smp_012_0010` });
			}
			return real(input, init);
		}) as typeof fetch;
		const transport = w.make();
		expect((await transport.push([slate('s1', d1, ['SMP_012_0010'])])).outcome).toBe('applied');
		expect(w.fpt.live(SET_SHOT).map((r) => r.id)).toEqual([theirs]);
		expect(setShotsField(w, 's1')).toEqual([theirs]);
		expect(ids(setShotOf(w, 'SMP_012_0010')!.values.sg_shots)).toEqual([s.a]);
		expect(shotsField(w, 's1')).toEqual([s.a]);
	});

	// A batch with no answer may have committed (findings/127): looked up, never sent blind.
	it('finds the Set Shots of a create whose answer was lost, and files no second one', async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		w.fpt.failNext((r) => r.path === '/api/v1/entity/_batch' && JSON.stringify(r.body).includes('"create","entity":"CustomEntity22"'), { after: 'network' });
		await applied(w, [slate('s1', d1, ['SMP_012_0010'])]);
		expect(w.fpt.live(SET_SHOT)).toHaveLength(1);
		expect(setShotsField(w, 's1')).toEqual([setShotOf(w, 'SMP_012_0010')!.id]);
		expect(shotsField(w, 's1')).toEqual([s.a]);
	});

	// Nothing is kept on the device: what did not land is worked out again at the next sync.
	it('keeps the push when the links cannot be read or written, and the next sync makes them', async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		w.fpt.failNext((r) => r.path === '/api/v1/entity/slates/_search', { status: 503 });
		const s1 = await pushed(w, slate('s1', d1, ['SMP_012_0010']));
		expect(w.fpt.byUuid('Slate', 's1')).toBeDefined();
		expect(w.shotNews).toEqual([]);
		w.fpt.failNext((r) => r.method === 'PUT' && r.path.startsWith('/api/v1/entity/slates/'), 'network');
		await w.transport.linkShots([{ slate: 's1', remoteId: s1, codes: ['SMP_012_0010'] }]);
		expect(setShotsField(w, 's1')).toEqual([]);
		await w.transport.linkShots([{ slate: 's1', remoteId: s1, codes: ['SMP_012_0010'] }]);
		expect(setShotsField(w, 's1')).toEqual([setShotOf(w, 'SMP_012_0010')!.id]);
		expect(shotsField(w, 's1')).toEqual([s.a]);
	});

	it('cannot be asked offline: it says nothing', async () => {
		const w = world();
		w.fpt.online = false;
		expect(await w.transport.linkShots([{ slate: 's1', remoteId: 5, codes: ['SMP_012_0010'] }])).toBeUndefined();
	});

	// Kevin, #117: Set Shot is optional. Without it the slate syncs, and its links wait.
	it('syncs the slate and leaves its links to wait on a site without Set Shot', async () => {
		const w = world();
		delete w.fpt.types.CustomEntity22;
		delete w.fpt.fields.Slate.sg_set_shots;
		const d1 = await day(w);
		shots(w);
		const s1 = await pushed(w, slate('s1', d1, ['SMP_012_0010']));
		expect(w.fpt.byUuid('Slate', 's1')!.values.sg_vfx_shots).toBe('SMP_012_0010');
		expect(shotSearches(w)).toEqual([]);
		expect(writes(w)).toEqual([]);
		expect(w.shotNews).toEqual([]);
		expect(await w.transport.linkShots([{ slate: 's1', remoteId: s1, codes: ['SMP_012_0010'] }])).toBeUndefined();
	});

	it('finds a Set Shot renamed in Flow PT by its key: renaming moves nothing', async () => {
		const w = world();
		const d1 = await day(w);
		const s = shots(w);
		await applied(w, [slate('s1', d1, ['SMP_012_0010'])]);
		const set = setShotOf(w, 'SMP_012_0010')!;
		set.values.code = 'Hero plate';
		await applied(w, [slate('s2', d1, ['SMP_012_0010'])]);
		expect(w.fpt.live(SET_SHOT)).toHaveLength(1);
		expect(setShotsField(w, 's2')).toEqual([set.id]);
		expect(shotsField(w, 's2')).toEqual([s.a]);
	});

	it('reads every page of the project Shots for the suggestions', async () => {
		const w = world();
		for (let i = 0; i < 503; i++) w.fpt.seed('Shot', { code: `SH${String(i).padStart(4, '0')}`, project: { type: 'Project', id: w.projectId } });
		w.fpt.seed('Shot', { code: 'ELSEWHERE', project: { type: 'Project', id: w.fpt.seed('Project', { name: 'Other' }) } });
		const codes = await readShotCodes({ site: w.fpt.site, bearer: async () => BEARER, fetch: w.fpt.fetch, schemaCache: w.cache, online: () => w.fpt.online }, w.projectId);
		expect(codes.length).toBe(503);
		expect(codes[0]).toBe('SH0000');
		expect(codes).not.toContain('ELSEWHERE');
		expect(shotSearches(w).length).toBe(2);
	});
});

describe('the Slates a set reference shows on (#107)', () => {
	type Ref = { type: string; id: number };
	/** A day, slates 42A and 42B, and an HDRI logged on 42A, on the server. */
	async function logged(w: World) {
		const ids = await shoot(w);
		const s2 = create('slate', 's2', { shootDayId: 'd1', slateUID: '42B' }, { d1: ids.d1 });
		const r1 = create('reference', 'r1', { slateId: 's1', kind: 'hdri360', name: 'HDRI_0412', loggedAt: '2026-11-11T10:00:00.000Z' }, { s1: ids.s1 });
		const r2 = create('reference', 'r2', { slateId: 's1', kind: 'lidarScan', name: 'Scan 01', loggedAt: '2026-11-11T10:01:00.000Z' }, { s1: ids.s1 });
		const remote = await applied(w, [s2, r1, r2]);
		return { s1: Number(ids.s1), s2: Number(remote[s2.entryId]), r1: Number(remote[r1.entryId]), r2: Number(remote[r2.entryId]) };
	}
	const slatesField = (w: World, uuid: string) => ((w.fpt.byUuid('CustomEntity21', uuid)!.values.sg_slates as Ref[] | undefined) ?? []).map((r) => r.id).sort((x, y) => x - y);
	const writes = (w: World) => w.fpt.requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/api/v1/entity/custom_entity21s/'));

	it('sets the field whole to the slates each reference shows on, the mode in the body, and only where it differs', async () => {
		const w = world();
		const id = await logged(w);
		expect(await w.transport.linkReferenceSlates([{ reference: 'r1', remoteId: id.r1, slates: [id.s1, id.s2] }])).toEqual([]);
		expect(slatesField(w, 'r1')).toEqual([id.s1, id.s2]);
		expect(writes(w).map((r) => (r.body as { sg_slates: { multi_entity_update_mode: string } }).sg_slates.multi_entity_update_mode)).toEqual(['set']);
		// Again with nothing changed: read, nothing written.
		expect(await w.transport.linkReferenceSlates([{ reference: 'r1', remoteId: id.r1, slates: [id.s2, id.s1] }])).toEqual([]);
		expect(writes(w).length).toBe(1);
		// The slate it was logged on stays the one link of `sg_slate`.
		expect(w.fpt.byUuid('CustomEntity21', 'r1')!.values.sg_slate).toEqual({ type: 'Slate', id: id.s1 });
	});

	// Kevin, #107: derived as a slate's Shots are (#102). A link made by hand in Flow PT is overwritten.
	it('overwrites a slate a person linked in Flow PT', async () => {
		const w = world();
		const id = await logged(w);
		await w.transport.linkReferenceSlates([{ reference: 'r1', remoteId: id.r1, slates: [id.s1, id.s2] }]);
		const byHand = w.fpt.seed('Slate', { code: '99' });
		const row = w.fpt.byUuid('CustomEntity21', 'r1')!;
		row.values.sg_slates = [...(row.values.sg_slates as Ref[]), { type: 'Slate', id: byHand }];
		expect(await w.transport.linkReferenceSlates([{ reference: 'r1', remoteId: id.r1, slates: [id.s1, id.s2] }])).toEqual([]);
		expect(slatesField(w, 'r1')).toEqual([id.s1, id.s2]);
	});

	it('says which references it could not write; a refusal is that one alone', async () => {
		const w = world();
		const id = await logged(w);
		w.fpt.failNext((r) => r.method === 'PUT' && r.path.endsWith(`/${id.r1}`), { status: 503 });
		const failed = await w.transport.linkReferenceSlates([
			{ reference: 'r1', remoteId: id.r1, slates: [id.s1, id.s2] },
			{ reference: 'r2', remoteId: id.r2, slates: [id.s1] }
		]);
		expect(failed).toEqual(['r1']);
		expect(slatesField(w, 'r2')).toEqual([id.s1]);
	});

	it('writes nothing when the site gives no answer', async () => {
		const w = world();
		const id = await logged(w);
		w.fpt.online = false;
		expect(await w.transport.linkReferenceSlates([{ reference: 'r1', remoteId: id.r1, slates: [id.s1] }])).toBeUndefined();
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

describe('a setup diagram', () => {
	const png = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/png' });
	/** A slate on the server, and the ref of a diagram image of it, as the runner hands it over. */
	async function slate(w: World) {
		const ids = await shoot(w);
		const ref = (size: number, blobId: string): BlobRef => ({ table: 'slate', recordId: 's1', blobId, size, type: 'image/png', variant: 'diagram', recordRemoteId: ids.s1 });
		return { slate: ids.s1 as number, ref };
	}
	const diagrams = (w: World, slate: number) => (w.fpt.rows.get(`Slate:${slate}`)!.values.sg_setup_diagram as { id: number }[] | undefined) ?? [];
	async function upload(w: World, ref: BlobRef): Promise<RemoteId | undefined> {
		const s = await w.transport.beginUpload(ref);
		const part = await w.transport.uploadPart(s, { index: 0, data: png(ref.size) });
		return (await w.transport.finishUpload(s, [part])).remoteId;
	}

	it('goes up as an Attachment in the slate’s setup diagram field, named for the slate', async () => {
		const w = world();
		const s = await slate(w);
		const ref = s.ref(4000, 'b-dg1');
		const id = await upload(w, ref);
		const init = w.fpt.requests.find((r) => r.path.endsWith('/_upload') && r.method === 'GET')!;
		expect(init.path).toBe(`/api/v1/entity/slates/${s.slate}/sg_setup_diagram/_upload`);
		expect(init.query.get('filename')).toBe('onset_diagram_s1_b-dg1.png');
		const row = attachments(w).find((a) => a.id === id)!;
		expect(row.values).toMatchObject({ filename: 'onset_diagram_s1_b-dg1.png', display_name: 'Setup diagram' });
		expect(await w.transport.verifyUpload(ref, id)).toEqual({ verified: true, remoteId: id });
		expect(diagrams(w, s.slate).map((r) => r.id)).toEqual([id]);
	});

	it('shows one diagram on the slate once it is drawn again: the old image leaves the field, kept', async () => {
		const w = world();
		const s = await slate(w);
		const first = s.ref(4000, 'b-dg1');
		const second = s.ref(4100, 'b-dg2');
		const old = await upload(w, first);
		await w.transport.verifyUpload(first, old);
		const neu = await upload(w, second);
		expect(await w.transport.verifyUpload(second, neu)).toEqual({ verified: true, remoteId: neu });
		expect(diagrams(w, s.slate).map((r) => r.id)).toEqual([neu]);
		expect(attachments(w).map((a) => a.id)).toContain(old);
		// A late check of the old image leaves it off.
		expect(await w.transport.verifyUpload(first, old)).toMatchObject({ verified: true });
		expect(diagrams(w, s.slate).map((r) => r.id)).toEqual([neu]);
	});

	it('waits for its slate on the server', async () => {
		const w = world();
		const ref: BlobRef = { table: 'slate', recordId: 's1', blobId: 'b', size: 10, type: 'image/png', variant: 'diagram' };
		expect(await kindOf(w.transport.beginUpload(ref))).toBe('failed');
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

	it('sends the annotated copy beside the photo, named with an -annotated suffix, and finds both again', async () => {
		const w = world();
		const s = await still(w, 'ph1', { caption: 'Chart' });
		const original = s.ref(1200);
		const copy: BlobRef = { ...s.ref(900, 'b-flat'), variant: 'annotated' };
		await send(w, original);
		const sent = await send(w, copy);
		const row = attachments(w).find((a) => a.id === sent.remoteId)!;
		expect(row.values).toMatchObject({ filename: 'onset_ph1_b-flat-annotated.jpg', display_name: 'Photo 2026-11-11T09:01:02.000Z annotated', description: 'Chart' });
		expect(stills(w, s.take)).toHaveLength(2);
		expect(await w.transport.verifyUpload(copy, sent.remoteId)).toEqual({ verified: true, remoteId: row.id });
		expect(await w.transport.verifyUpload(original)).toMatchObject({ verified: true });
		// The still is found back by either file, with its capture time.
		const [found] = await w.transport.lookup([{ table: 'still', id: 'ph1' }]);
		expect(found.remoteId).toBe(encodeStillRemote({ take: s.take, capturedAt: '2026-11-11T09:01:02.000Z', caption: 'Chart' }));
	});

	it('shows one annotated copy on the take once the photo is drawn on again: the old copy leaves the field, kept, in one batch', async () => {
		const w = world();
		const s = await still(w, 'ph1');
		const original = s.ref(1200);
		const first: BlobRef = { ...s.ref(900, 'b-flat1'), variant: 'annotated' };
		const second: BlobRef = { ...s.ref(950, 'b-flat2'), variant: 'annotated' };
		const photo = await send(w, original);
		await w.transport.verifyUpload(original, photo.remoteId);
		const old = await send(w, first);
		expect(await w.transport.verifyUpload(first, old.remoteId)).toEqual({ verified: true, remoteId: old.remoteId });
		expect(stills(w, s.take).map((r) => r.id)).toEqual([photo.remoteId, old.remoteId]);

		const neu = await send(w, second);
		w.fpt.requests.length = 0;
		expect(await w.transport.verifyUpload(second, neu.remoteId)).toEqual({ verified: true, remoteId: neu.remoteId });
		expect(stills(w, s.take).map((r) => r.id)).toEqual([photo.remoteId, neu.remoteId]);
		// The old copy is off the field, not deleted: an Artist may not delete an Attachment (findings/143).
		expect(attachments(w).map((a) => a.id)).toContain(old.remoteId);
		// The mode goes in the body, in a batch (recipes/009, findings/154).
		const batch = batches(w).at(-1)!.body as { requests: { data: Record<string, { multi_entity_update_mode: string; value: { id: number }[] }> }[] };
		expect(batch.requests.map((r) => r.data.sg_photos)).toEqual([{ multi_entity_update_mode: 'remove', value: [{ type: 'Attachment', id: old.remoteId }] }]);
	});

	it('does not bring an older annotated copy back when it is checked late', async () => {
		const w = world();
		const s = await still(w, 'ph1');
		const first: BlobRef = { ...s.ref(900, 'b-flat1'), variant: 'annotated' };
		const second: BlobRef = { ...s.ref(950, 'b-flat2'), variant: 'annotated' };
		await send(w, s.ref(1200));
		const old = await send(w, first);
		const neu = await send(w, second);
		await w.transport.verifyUpload(second, neu.remoteId);
		// The older copy's check comes after: it is on Flow PT, so it is done, and it stays off the field.
		expect(await w.transport.verifyUpload(first, old.remoteId)).toEqual({ verified: true, remoteId: old.remoteId });
		expect(stills(w, s.take).map((r) => r.id)).not.toContain(old.remoteId);
		expect(stills(w, s.take).map((r) => r.id)).toContain(neu.remoteId);
	});

	it('puts the newest annotated copy back on the field when it is missing there', async () => {
		const w = world();
		const s = await still(w, 'ph1');
		const copy: BlobRef = { ...s.ref(900, 'b-flat1'), variant: 'annotated' };
		const sent = await send(w, copy);
		// Someone took it off in the web interface.
		w.fpt.rows.get(`CustomEntity09:${s.take}`)!.values.sg_photos = [];
		expect(stills(w, s.take)).toEqual([]);
		expect(await w.transport.verifyUpload(copy, sent.remoteId)).toMatchObject({ verified: true });
		expect(stills(w, s.take).map((r) => r.id)).toEqual([sent.remoteId]);
	});

	it('writes a new caption on the photo and on its annotated copy', async () => {
		const w = world();
		const s = await still(w, 'ph1', { caption: 'Chart' });
		await send(w, s.ref(1200));
		await send(w, { ...s.ref(900, 'b-flat'), variant: 'annotated' });
		const edit = update('still', 'ph1', s.remote, { caption: ['Chart', 'Grey ball'] });
		expect(await w.transport.push([edit])).toMatchObject({ outcome: 'applied' });
		expect(attachments(w).map((a) => a.values.description)).toEqual(['Grey ball', 'Grey ball']);
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

// ---------------------------------------------------------------------------------- videos

// Kevin, 2026-11-17 (#94): a video goes up as a Version linked to its take, its file in
// `sg_uploaded_movie`; a photo stays an Attachment. The live behaviour of a Version whose `entity`
// is a custom entity row awaits a finding in sg-groundtruth: this is the fake site's.
async function video(w: World, id = 'v1', fields: Record<string, unknown> = {}) {
	const s = await still(w, id, fields);
	const ref = (size: number, blobId = `b-${id}`): BlobRef => ({ ...s.ref(size, blobId), type: 'video/quicktime' });
	return { ...s, ref };
}

const versions = (w: World) => w.fpt.live('Version');
const movieOf = (w: World) => versions(w)[0].values.sg_uploaded_movie as { type: string; id: number } | undefined;

describe('a video', () => {
	it('goes up as a Version linked to its take, the file in its movie field', async () => {
		const w = world();
		const v = await video(w, 'v1', { caption: 'Witness cam B' });
		const ref = v.ref(1200);
		const session = await w.transport.beginUpload(ref);
		const [version] = versions(w);
		// entity_types/Version.md: the project, the link {type, id}; the client UUID is ours.
		expect(version.values).toMatchObject({
			project: { type: 'Project', id: w.projectId },
			entity: { type: 'CustomEntity09', id: v.take },
			code: 'Video 2026-11-11T09:01:02.000Z',
			sg_onset_uuid: 'v1',
			description: 'Witness cam B'
		});
		const init = w.fpt.requests.find((r) => r.path.endsWith('/_upload') && r.method === 'GET')!;
		expect(init.path).toBe(`/api/v1/entity/versions/${version.id}/sg_uploaded_movie/_upload`);
		expect(init.query.get('filename')).toBe('onset_video_v1_b-v1.mov');

		const sent = await send(w, ref, session);
		expect(sent.remoteId).toBe(version.id);
		expect(movieOf(w)).toMatchObject({ type: 'Attachment' });
		// Not a photo: the take's photos field is left alone.
		expect(stills(w, v.take)).toEqual([]);
		const put = w.fpt.requests.find((r) => r.host === 'storage' && r.method === 'PUT')!;
		expect(put.headers.get('content-type')).toBe('video/quicktime');
		expect(await w.transport.verifyUpload(ref, sent.remoteId)).toEqual({ verified: true, remoteId: version.id });
	});

	it('makes one Version however often the upload starts', async () => {
		const w = world();
		const v = await video(w);
		await w.transport.beginUpload(v.ref(300));
		await w.transport.beginUpload(v.ref(300));
		expect(versions(w).length).toBe(1);
	});

	// findings/127: a create that landed and never answered is refused when sent again.
	it('a create that landed and never answered is found, not made twice', async () => {
		const w = world();
		const v = await video(w);
		w.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { after: 'network' });
		expect(await kindOf(w.transport.beginUpload(v.ref(300)))).toBe('timeout');
		expect(versions(w).length).toBe(1);
		await send(w, v.ref(300));
		expect(versions(w).length).toBe(1);
		expect(await w.transport.verifyUpload(v.ref(300))).toEqual({ verified: true, remoteId: versions(w)[0].id });
	});

	it('takes a create refused as not unique as the Version an earlier try made', async () => {
		const w = world();
		const v = await video(w);
		const id = w.fpt.seed('Version', { project: { type: 'Project', id: w.projectId }, entity: { type: 'CustomEntity09', id: v.take }, sg_onset_uuid: 'v1' });
		// The first look misses it, as one made a moment ago can be (findings/127: readable within two seconds).
		w.fpt.failNext((r) => r.path === '/api/v1/entity/versions/_search', { status: 200, body: { data: [], links: {} } });
		const sent = await send(w, v.ref(300));
		expect(sent.remoteId).toBe(id);
		expect(versions(w).length).toBe(1);
	});

	it('sends a large video in parts', async () => {
		const w = world({ upload: { singlePutMax: 10, partSize: 6 } });
		w.fpt.partFloor = 6;
		const v = await video(w);
		const ref = v.ref(16);
		const sent = await send(w, ref);
		expect(sent.parts.length).toBe(3);
		expect(await w.transport.verifyUpload(ref, sent.remoteId)).toEqual({ verified: true, remoteId: versions(w)[0].id });
	});

	// findings/039: a completion answers 201 with no bytes behind it. A new upload replaces the file (findings/022).
	it('is not verified when the movie never arrived; sent again, it replaces it on the same Version', async () => {
		const w = world();
		const v = await video(w);
		w.fpt.loseNextUpload = true;
		const first = await send(w, v.ref(500));
		expect(await w.transport.verifyUpload(v.ref(500), first.remoteId)).toEqual({ verified: false, remoteId: versions(w)[0].id });
		await send(w, v.ref(500));
		expect(await w.transport.verifyUpload(v.ref(500))).toEqual({ verified: true, remoteId: versions(w)[0].id });
		expect(versions(w).length).toBe(1);
	});

	it('is not verified when the movie is not this file or not whole', async () => {
		const w = world();
		const v = await video(w);
		await send(w, v.ref(500));
		expect(await w.transport.verifyUpload(v.ref(501))).toMatchObject({ verified: false });
		expect(await w.transport.verifyUpload(v.ref(500, 'another-blob'))).toMatchObject({ verified: false });
	});

	it('is not verified before anything was sent', async () => {
		const w = world();
		const v = await video(w);
		expect(await w.transport.verifyUpload(v.ref(500))).toEqual({ verified: false });
	});

	// entity_types/Version.md: read a link back to confirm it.
	it('puts the take back on a Version that lost it', async () => {
		const w = world();
		const v = await video(w);
		await send(w, v.ref(500));
		versions(w)[0].values.entity = null;
		expect(await w.transport.verifyUpload(v.ref(500))).toMatchObject({ verified: true });
		expect(versions(w)[0].values.entity).toEqual({ type: 'CustomEntity09', id: v.take });
	});

	it('says what the site refused when it may not make the Version', async () => {
		const w = world();
		const v = await video(w);
		w.fpt.forbidden.add('create:Version');
		expect(await kindOf(w.transport.beginUpload(v.ref(300)))).toBe('failed');
		expect(versions(w)).toEqual([]);
	});
});

describe('a video, after its upload', () => {
	it('is found by client UUID, with its take, from its Version', async () => {
		const w = world();
		const v = await video(w);
		await send(w, v.ref(300));
		expect(await w.transport.lookup([{ table: 'still', id: 'v1' }])).toEqual([
			{ table: 'still', id: 'v1', remoteId: encodeStillRemote({ take: v.take, capturedAt: '2026-11-11T09:01:02.000Z' }) }
		]);
	});

	// findings/123: the server adds Attachments named after the movie. A photo's search never takes them.
	it('leaves the photos of the take as they are, and a photo lookup finds only photos', async () => {
		const w = world();
		const v = await video(w);
		await send(w, v.ref(300));
		const p = await still(w, 'ph1');
		await send(w, p.ref(200));
		expect(stills(w, v.take).length).toBe(1);
		const found = await w.transport.lookup([{ table: 'still', id: 'ph1' }]);
		expect(found).toEqual([{ table: 'still', id: 'ph1', remoteId: encodeStillRemote({ take: v.take, capturedAt: '2026-11-11T09:01:02.000Z' }) }]);
	});

	it('takes a caption, gives it back, and is deleted with its Version', async () => {
		const w = world();
		const v = await video(w);
		await send(w, v.ref(300));
		await applied(w, [update('still', 'v1', v.remote, { caption: [undefined, 'Wide'] })]);
		expect(versions(w)[0].values.description).toBe('Wide');
		expect(await w.transport.read([{ table: 'still', id: 'v1', remoteId: v.remote, keys: ['caption', 'capturedAt'] }])).toEqual([
			{ table: 'still', id: 'v1', remoteId: v.remote, fields: { caption: 'Wide', capturedAt: '2026-11-11T09:01:02.000Z' } }
		]);
		const attachmentsBefore = attachments(w).length;
		await applied(w, [del('still', 'v1', v.remote)]);
		expect(versions(w)).toEqual([]);
		// The movie and the server's transcodes are the Version's: nothing of ours deletes them.
		expect(attachments(w).length).toBe(attachmentsBefore);
		expect(await w.transport.lookup([{ table: 'still', id: 'v1' }])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------------- audio notes

// Kevin, 2026-11-17 (#89): an audio note goes up as a Version linked to its take, as a video does,
// kept as the browser wrote it: M4A from Safari, WebM from Chrome. Live: a Version takes the take
// row as `entity` (findings/151); audio on its movie field becomes an AAC mp4 (findings/152).
async function audioNote(w: World, id: string, type: string) {
	const s = await still(w, id);
	const ref = (size: number, blobId = `b-${id}`): BlobRef => ({ ...s.ref(size, blobId), type });
	return { ...s, ref };
}

describe('an audio note', () => {
	it.each([
		['audio/mp4', 'onset_audio_a1_b-a1.m4a'],
		['audio/webm', 'onset_audio_a1_b-a1.webm']
	])('goes up as a Version of its take, %s as it was recorded', async (type, filename) => {
		const w = world();
		const a = await audioNote(w, 'a1', type);
		const ref = a.ref(900);
		const session = await w.transport.beginUpload(ref);
		const [version] = versions(w);
		expect(version.values).toMatchObject({ entity: { type: 'CustomEntity09', id: a.take }, code: 'Audio note 2026-11-11T09:01:02.000Z', sg_onset_uuid: 'a1' });
		const init = w.fpt.requests.find((r) => r.path.endsWith('/_upload') && r.method === 'GET')!;
		expect(init.path).toBe(`/api/v1/entity/versions/${version.id}/sg_uploaded_movie/_upload`);
		expect(init.query.get('filename')).toBe(filename);
		const sent = await send(w, ref, session);
		const put = w.fpt.requests.find((r) => r.host === 'storage' && r.method === 'PUT')!;
		expect(put.headers.get('content-type')).toBe(type);
		// Not a photo: the take's photos field is left alone.
		expect(stills(w, a.take)).toEqual([]);
		expect(await w.transport.verifyUpload(ref, sent.remoteId)).toEqual({ verified: true, remoteId: version.id });
	});

	it('keeps its name when its time changes', async () => {
		const w = world();
		const a = await audioNote(w, 'a1', 'audio/mp4');
		await send(w, a.ref(300));
		await applied(w, [update('still', 'a1', a.remote, { capturedAt: ['2026-11-11T09:01:02.000Z', '2026-11-11T09:30:00.000Z'] })]);
		expect(versions(w)[0].values.code).toBe('Audio note 2026-11-11T09:30:00.000Z');
		expect(await w.transport.lookup([{ table: 'still', id: 'a1' }])).toEqual([
			{ table: 'still', id: 'a1', remoteId: encodeStillRemote({ take: a.take, capturedAt: '2026-11-11T09:30:00.000Z' }) }
		]);
	});
});
