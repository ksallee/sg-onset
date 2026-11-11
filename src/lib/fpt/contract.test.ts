// The outbox's runner, driven through the FPT transport against the fake site. The runner's own
// scenario tests are built on its in-memory transport and cannot take another, so the scenarios
// that carry the contract are replayed here: same queue, same runner, the real transport.

import { describe, expect, it } from 'vitest';
import { resolveConflict } from '$lib/outbox/conflict';
import { memoryPort } from '$lib/outbox/port';
import { enqueue } from '$lib/outbox/queue';
import { createRunner, type DrainReport } from '$lib/outbox/runner';
import { blob, create, del, fresh, update } from '$lib/outbox/testkit';
import type { Op, Policy } from '$lib/outbox/types';
import { memoryKeyValue } from './cache';
import { BEARER, fakeFpt, type FakeFpt } from './fakeFpt';
import { decodeStillRemote } from './stills';
import { createFptTransport } from './transport';

const TAKE = 'CustomEntity09';
const DONE = { stopped: 'idle', unsynced: { entries: 0, records: 0, blobs: 0, attention: 0 } };

function setup(options: { policy?: Partial<Policy>; upload?: { singlePutMax: number; partSize: number }; partMs?: number } = {}) {
	const fpt = fakeFpt();
	const projectId = fpt.seed('Project', { name: 'Show' });
	const port = memoryPort();
	const world = { visible: true };
	// Each part takes time: the clock moves while the bytes go up.
	const slow: typeof fetch = async (input, init) => {
		if (options.partMs && init?.method === 'PUT' && String(input).includes('amazonaws.com')) fpt.clock.t += options.partMs;
		return fpt.fetch(input, init);
	};
	const transport = createFptTransport({
		site: fpt.site,
		bearer: async () => BEARER,
		fetch: slow,
		schemaCache: memoryKeyValue(),
		projectId,
		now: () => fpt.clock.t,
		online: () => fpt.online,
		...(options.upload ? { upload: options.upload } : {})
	});
	const runner = createRunner({
		port,
		transport,
		policy: options.policy ?? {},
		env: { now: () => fpt.clock.t, visible: () => world.visible, online: () => fpt.online, random: () => 1 }
	});
	const add = (op: Op, dependsOn: string[] = []) => port.update((q) => enqueue(q, op, dependsOn, fresh(fpt.clock.t)));
	/** Drains, moving the clock to each scheduled retry, until nothing is scheduled. */
	const settle = async (): Promise<DrainReport> => {
		for (let i = 0; i < 50; i++) {
			const report = await runner.drain();
			if (report.stopped !== 'waiting') return report;
			fpt.clock.t = report.waitUntil!;
		}
		throw new Error('never settled');
	};
	const photo = (id: string, size = 10) => port.blobs.set(id, new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
	return { fpt, projectId, port, world, runner, add, settle, photo };
}

type S = ReturnType<typeof setup>;

/** A project, a day, a slate, a camera, a take, a still and its file: five levels, queued children first. */
async function shoot(s: S) {
	await s.add(blob('ph1'), ['ph1']);
	await s.add(create('still', 'ph1', { takeId: 't1', capturedAt: '2026-11-11T09:01:02Z' }), ['t1']);
	await s.add(create('take', 't1', { slateId: 's1', cameraId: 'c1', take: '1', tStop: 2.8 }), ['s1', 'c1']);
	await s.add(create('slate', 's1', { shootDayId: 'd1', slateUID: '42A' }), ['d1']);
	await s.add(create('camera', 'c1', { projectId: 'p1', cameraModel: 'Alexa 35' }), ['p1']);
	await s.add(create('shootDay', 'd1', { projectId: 'p1', shootDate: '2026-11-11' }), ['p1']);
	await s.add(create('project', 'p1', { name: 'Show' }));
	s.photo('ph1');
}

const batchesOf = (fpt: FakeFpt) =>
	fpt.requests
		.filter((r) => r.path === '/api/v1/entity/_batch')
		.map((r) => (r.body as { requests: { request_type: string; entity: string }[] }).requests.map((q) => `${q.request_type} ${q.entity}`));
const takeRow = (s: S) => s.fpt.byUuid(TAKE, 't1')!;
const stillsOf = (s: S) => (takeRow(s).values.sg_stills as { id: number }[] | undefined) ?? [];

describe('the runner over the FPT transport', () => {
	it('sends parents before children, one dependency level per batch, then the file, and verifies it', async () => {
		const s = setup();
		await shoot(s);
		expect(await s.runner.drain()).toEqual(DONE);
		// The project and the still send nothing: three batches for five levels.
		expect(batchesOf(s.fpt)).toEqual([['create Camera', 'create ShootDay'], ['create Slate'], [`create ${TAKE}`]]);
		const take = takeRow(s);
		expect(take.values).toMatchObject({
			code: '1',
			sg_slate: { type: 'Slate', id: s.fpt.byUuid('Slate', 's1')!.id },
			sg_camera: { type: 'Camera', id: s.fpt.byUuid('Camera', 'c1')!.id },
			project: { type: 'Project', id: s.projectId }
		});
		expect(s.port.remotes.get('t1')).toBe(take.id);
		expect(s.port.remotes.get('p1')).toBe(s.projectId);
		expect(decodeStillRemote(s.port.remotes.get('ph1'))).toMatchObject({ take: take.id });
		const [attachment] = s.fpt.live('Attachment');
		expect(stillsOf(s)).toEqual([{ type: 'Attachment', id: attachment.id }]);
		// Ids, never URLs.
		expect(s.port.verified.get('ph1')).toBe(attachment.id);
	});

	it('offline, then drains everything', async () => {
		const s = setup();
		s.fpt.online = false;
		await shoot(s);
		expect((await s.runner.drain()).stopped).toBe('offline');
		expect(s.port.queue.every((e) => e.attempts === 0)).toBe(true);
		s.fpt.online = true;
		expect(await s.settle()).toEqual(DONE);
		expect(s.fpt.live(TAKE).length).toBe(1);
	});

	// corpus findings/127: an abandoned batch still commits, and the unique client UUID is the guard.
	it('a batch that committed with no answer is found by client UUID, never sent twice', async () => {
		const s = setup();
		await shoot(s);
		s.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { after: 'network' });
		expect(await s.settle()).toEqual(DONE);
		expect(s.fpt.live('Camera').length).toBe(1);
		expect(s.fpt.live('ShootDay').length).toBe(1);
		expect(s.port.remotes.get('c1')).toBe(s.fpt.byUuid('Camera', 'c1')!.id);
		expect(batchesOf(s.fpt)[0]).toEqual(['create Camera', 'create ShootDay']);
		expect(batchesOf(s.fpt).filter((b) => b.includes('create Camera')).length).toBe(1);
	});

	it('a batch that never arrived is sent again after the check', async () => {
		const s = setup();
		await shoot(s);
		s.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', 'network');
		expect(await s.settle()).toEqual(DONE);
		expect(s.fpt.live('Camera').length).toBe(1);
		expect(s.fpt.live(TAKE).length).toBe(1);
	});

	it('a duplicate refused means already created: looked up, and the rest of the batch goes again', async () => {
		const s = setup();
		const existing = s.fpt.seed('Camera', { sg_onset_uuid: 'c1', code: 'Alexa 35', project: { type: 'Project', id: s.projectId } });
		await shoot(s);
		expect(await s.settle()).toEqual(DONE);
		expect(s.fpt.live('Camera').length).toBe(1);
		expect(s.port.remotes.get('c1')).toBe(existing);
		expect(takeRow(s).values.sg_camera).toEqual({ type: 'Camera', id: existing });
	});

	it('stops when the bearer is refused and counts no attempt; goes on after sign-in', async () => {
		const s = setup();
		await shoot(s);
		s.fpt.bearerValid = false;
		expect((await s.runner.drain()).stopped).toBe('unauthorized');
		expect(s.port.queue.every((e) => e.attempts === 0)).toBe(true);
		s.fpt.bearerValid = true;
		expect(await s.settle()).toEqual(DONE);
	});

	it('a passing failure is retried with backoff', async () => {
		const s = setup();
		await shoot(s);
		await s.runner.drain();
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		s.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { status: 503 });
		expect((await s.runner.drain()).stopped).toBe('waiting');
		expect(await s.settle()).toEqual(DONE);
		expect(takeRow(s).values.sg_t_stop).toBe(4);
	});

	it('an operation the server will never take needs attention; the others go on', async () => {
		const s = setup();
		await s.add(create('project', 'p1', { name: 'Show' }));
		await s.add(create('camera', 'c1', { projectId: 'p1', cameraModel: 'A', mood: 'tense' }), ['p1']);
		await s.add(create('camera', 'c2', { projectId: 'p1', cameraModel: 'B' }), ['p1']);
		const report = await s.settle();
		expect(report.unsynced.attention).toBe(1);
		expect(s.port.queue.map((e) => [e.op.recordId, e.attention])).toEqual([['c1', { reason: 'refused', message: expect.stringContaining('camera.mood') }]]);
		expect(s.fpt.byUuid('Camera', 'c2')).toBeDefined();
	});

	it('a delete of a record the server no longer has is done; an update to one needs attention', async () => {
		const s = setup();
		await shoot(s);
		await s.runner.drain();
		s.fpt.rows.get(`Camera:${s.port.remotes.get('c1')}`)!.retired = true;
		await s.add(del('camera', 'c1'));
		expect(await s.settle()).toEqual(DONE);

		takeRow(s).retired = true;
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		await s.settle();
		expect(s.port.queue[0].attention).toEqual({ reason: 'gone' });
	});
});

describe('conflict, through the mapping', () => {
	async function edited() {
		const s = setup();
		await shoot(s);
		await s.runner.drain();
		return s;
	}

	it('an edit the server has not touched is sent', async () => {
		const s = await edited();
		await s.add(update('take', 't1', { tStop: [2.8, 4], lensHeight: [undefined, { m: 1.8288, entered: { text: "6'", system: 'imperial' } }], circleTake: [undefined, true] }));
		expect(await s.settle()).toEqual(DONE);
		expect(takeRow(s).values).toMatchObject({ sg_t_stop: 4, sg_lens_height_m: 1.8288, sg_circle_take: true });
	});

	it('is surfaced when the server changed under us: nothing is overwritten, nothing is dropped', async () => {
		const s = await edited();
		takeRow(s).values.sg_t_stop = 5.6;
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		const report = await s.settle();
		expect(report.unsynced.attention).toBe(1);
		expect(s.port.queue[0].attention).toEqual({ reason: 'conflict', conflicts: [{ key: 'tStop', base: 2.8, local: 4, server: 5.6 }] });
		expect(takeRow(s).values.sg_t_stop).toBe(5.6);

		await s.port.update((q) => resolveConflict(q, s.port.queue[0].id, () => 'mine').queue);
		expect(await s.settle()).toEqual(DONE);
		expect(takeRow(s).values.sg_t_stop).toBe(4);
	});

	it('the same value on both sides is no conflict and is not sent', async () => {
		const s = await edited();
		takeRow(s).values.sg_t_stop = 4;
		const before = batchesOf(s.fpt).length;
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		expect(await s.settle()).toEqual(DONE);
		expect(batchesOf(s.fpt).length).toBe(before);
	});

	it('an update that committed with no answer is seen to have landed and is not sent again', async () => {
		const s = await edited();
		await s.add(update('take', 't1', { focusDistance: [undefined, { m: 'inf' }], captureFrameRate: [undefined, { num: 24000, denom: 1001 }] }));
		s.fpt.failNext((r) => r.path === '/api/v1/entity/_batch', { after: 'network' });
		const before = batchesOf(s.fpt).length;
		expect(await s.settle()).toEqual(DONE);
		expect(batchesOf(s.fpt).length).toBe(before + 1);
		expect(takeRow(s).values).toMatchObject({ sg_focus_distance_m: 1_000_000_000, sg_capture_frame_rate: '24000/1001' });
	});

	it('relinks a take to another lens and sees it on the server', async () => {
		const s = await edited();
		await s.add(create('lens', 'l2', { projectId: 'p1', lensModel: 'MP 85', focalLength: 85 }), ['p1']);
		await s.add(update('take', 't1', { lensId: [undefined, 'l2'] }), ['l2']);
		expect(await s.settle()).toEqual(DONE);
		expect(takeRow(s).values.sg_lens).toEqual({ type: 'CustomEntity19', id: s.port.remotes.get('l2') });
	});
});

describe('upload, through the runner', () => {
	const sizes = { singlePutMax: 10, partSize: 6 };

	it('sends a large file in the parts the transport asks for', async () => {
		const s = setup({ upload: sizes });
		s.fpt.partFloor = 6;
		await shoot(s);
		s.photo('ph1', 16);
		s.port.queue = s.port.queue.map((e) => (e.op.kind === 'blob' ? { ...e, op: { ...e.op, size: 16 } } : e));
		expect(await s.settle()).toEqual(DONE);
		expect([...s.fpt.objects.values()].map((o) => [...o.values()])).toEqual([[6, 6, 4]]);
		expect(stillsOf(s).length).toBe(1);
	});

	// corpus findings/125: a URL dies between 840 s and 910 s.
	it('a URL that expires mid-upload is renewed and the upload carries on', async () => {
		const s = setup({ upload: sizes, partMs: 9 * 60_000 });
		s.fpt.partFloor = 6;
		await shoot(s);
		s.photo('ph1', 22);
		s.port.queue = s.port.queue.map((e) => (e.op.kind === 'blob' ? { ...e, op: { ...e.op, size: 22 } } : e));
		expect(await s.settle()).toEqual(DONE);
		// One upload, four parts, each sent once: nothing started again.
		expect(s.fpt.count((r) => r.path.endsWith('/_upload') && r.method === 'GET')).toBe(1);
		expect([...s.fpt.objects.values()].map((o) => [...o.values()])).toEqual([[6, 6, 6, 4]]);
		expect(s.fpt.count((r) => r.host === 'storage' && r.method === 'PUT')).toBe(4);
		expect(s.fpt.live('Attachment').length).toBe(1);
	});

	// corpus findings/039: a 201 proves nothing.
	it('an upload that answered and is not there is sent again', async () => {
		const s = setup();
		await shoot(s);
		s.fpt.loseNextUpload = true;
		expect(await s.settle()).toEqual(DONE);
		expect(s.fpt.count((r) => r.host === 'storage' && r.method === 'PUT')).toBe(2);
		const [attachment] = s.fpt.live('Attachment');
		expect(s.fpt.live('Attachment').length).toBe(1);
		expect(s.port.verified.get('ph1')).toBe(attachment.id);
		expect(stillsOf(s).filter((a) => !s.fpt.rows.get(`Attachment:${a.id}`)!.retired)).toEqual([{ type: 'Attachment', id: attachment.id }]);
	});

	it('a completion with no answer is checked before the file is sent again', async () => {
		const s = setup();
		await shoot(s);
		s.fpt.failNext((r) => r.path.endsWith('/_upload') && r.method === 'POST', { after: 'network' });
		expect(await s.settle()).toEqual(DONE);
		expect(s.fpt.count((r) => r.host === 'storage' && r.method === 'PUT')).toBe(1);
		expect(s.fpt.live('Attachment').length).toBe(1);
	});

	it('deletes a still: the Attachment goes with it', async () => {
		const s = setup();
		await shoot(s);
		await s.runner.drain();
		await s.add(del('still', 'ph1'));
		expect(await s.settle()).toEqual(DONE);
		expect(s.fpt.live('Attachment')).toEqual([]);
	});
});
