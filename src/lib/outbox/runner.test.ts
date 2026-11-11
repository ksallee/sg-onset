import { describe, expect, it } from 'vitest';
import { resolveConflict } from './conflict';
import { fakeTransport } from './fakeTransport';
import { retry } from './machine';
import { memoryPort } from './port';
import { enqueue } from './queue';
import { createRunner, type DrainReport, type Progress } from './runner';
import { blob, create, del, fresh, update } from './testkit';
import type { Entry, Op, Policy } from './types';

const WEEK = 7 * 24 * 3600_000;

function setup(policy: Partial<Policy> = {}) {
	const clock = { t: 1_000_000 };
	const port = memoryPort();
	const transport = fakeTransport(clock);
	const world = { visible: true, online: true };
	const progress: Progress[] = [];
	const runner = createRunner({
		port,
		transport,
		policy,
		env: { now: () => clock.t, visible: () => world.visible, online: () => world.online, random: () => 1 },
		onProgress: (p) => progress.push(p)
	});
	const add = (op: Op, dependsOn: string[] = []) => port.update((q) => enqueue(q, op, dependsOn, fresh(clock.t)));
	/** Drains, moving the clock to each scheduled retry, until nothing is scheduled. */
	const settle = async (): Promise<DrainReport> => {
		for (let i = 0; i < 50; i++) {
			const report = await runner.drain();
			if (report.stopped !== 'waiting') return report;
			clock.t = report.waitUntil!;
		}
		throw new Error('never settled');
	};
	const photo = (id: string, size = 10) => port.blobs.set(id, new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
	return { clock, port, transport, world, progress, runner, add, settle, photo };
}

/** A project, a day, a slate, a camera, a take, a still and its file: five levels. */
async function shoot(s: ReturnType<typeof setup>) {
	await s.add(blob('ph1'), ['ph1']);
	await s.add(create('still', 'ph1', { takeId: 't1' }), ['t1']);
	await s.add(create('take', 't1', { slateId: 's1', cameraId: 'c1', take: '1' }), ['s1', 'c1']);
	await s.add(create('slate', 's1', { shootDayId: 'd1' }), ['d1']);
	await s.add(create('camera', 'c1', { projectId: 'p1' }), ['p1']);
	await s.add(create('shootDay', 'd1', { projectId: 'p1' }), ['p1']);
	await s.add(create('project', 'p1', { name: 'Show' }));
	s.photo('ph1');
}

const kinds = (batch: { op: Op }[]) => batch.map((o) => `${o.op.kind} ${o.op.recordId}`);

describe('drain', () => {
	it('sends parents before children, one dependency level per batch, then the file', async () => {
		const s = setup();
		await shoot(s);
		const report = await s.runner.drain();
		expect(report).toEqual({ stopped: 'idle', unsynced: { entries: 0, records: 0, blobs: 0, attention: 0 } });
		expect(s.transport.batches.map(kinds)).toEqual([
			['create p1'],
			['create c1', 'create d1'],
			['create s1'],
			['create t1'],
			['create ph1']
		]);
		expect(s.transport.violations).toEqual([]);
		expect([...s.transport.rows.keys()].sort()).toEqual(['c1', 'd1', 'p1', 'ph1', 's1', 't1']);
		expect(s.port.remotes.get('t1')).toBe(s.transport.rows.get('t1')!.remoteId);
		expect(s.transport.files.get('ph1')).toMatchObject({ size: 10, recordRemoteId: s.transport.rows.get('ph1')!.remoteId });
		expect(s.port.verified.has('ph1')).toBe(true);
	});

	it('cuts a level into batches of at most the cap', async () => {
		const s = setup({ maxOps: 25 });
		for (let i = 0; i < 60; i++) await s.add(create('project', `p${i}`));
		await s.runner.drain();
		expect(s.transport.batches.map((b) => b.length)).toEqual([25, 25, 10]);
	});

	it('offline for a week, then drains everything', async () => {
		const s = setup();
		s.world.online = false;
		await shoot(s);
		for (let i = 0; i < 40; i++) {
			await s.add(create('take', `x${i}`, { slateId: 's1' }), ['s1']);
			await s.add(update('take', `x${i}`, { notes: [undefined, `n${i}`] }));
		}
		const before = await s.runner.drain();
		expect(before.stopped).toBe('offline');
		expect(before.unsynced).toMatchObject({ entries: 47, records: 46, blobs: 1 });
		expect(s.transport.calls).toEqual([]);

		s.clock.t += WEEK;
		s.world.online = true;
		const after = await s.settle();
		expect(after.stopped).toBe('idle');
		expect(after.unsynced.entries).toBe(0);
		expect(s.transport.rows.size).toBe(46);
		expect(s.transport.rows.get('x7')!.fields).toEqual({ slateId: 's1', notes: 'n7' });
		expect(s.transport.files.has('ph1')).toBe(true);
		expect(s.transport.violations).toEqual([]);
	});

	it('stops when the network is gone mid-drain and counts no attempt', async () => {
		const s = setup();
		await shoot(s);
		s.transport.onCall = (method) => {
			if (method === 'push' && s.transport.batches.length === 2) s.transport.online = false;
		};
		const report = await s.runner.drain();
		expect(report.stopped).toBe('offline');
		expect(s.transport.rows.size).toBe(3);
		expect(s.port.queue.every((e) => e.state === 'pending' && e.attempts === 0)).toBe(true);
		s.transport.onCall = undefined;
		s.transport.online = true;
		expect((await s.runner.drain()).unsynced.entries).toBe(0);
	});

	it('does nothing while the page is hidden', async () => {
		const s = setup();
		await shoot(s);
		s.world.visible = false;
		expect((await s.runner.drain()).stopped).toBe('hidden');
		expect(s.transport.calls).toEqual([]);
	});

	it('stops on hide; what was in flight is checked on return, not sent again', async () => {
		const s = setup();
		await s.add(create('project', 'p1'));
		await s.add(create('project', 'p2'));
		let release!: () => void;
		s.transport.onCall = (method) => {
			if (method !== 'push') return;
			// The page is hidden while the request is out. The request lands; the answer never comes.
			s.world.visible = false;
			s.runner.stop();
			s.transport.seed('project', 'p1');
			return new Promise<void>((r) => (release = r));
		};
		const report = await s.runner.drain();
		expect(report.stopped).toBe('hidden');
		expect(s.port.queue.map((e) => e.state)).toEqual(['sentUnconfirmed', 'sentUnconfirmed']);
		release();

		s.transport.onCall = undefined;
		s.world.visible = true;
		await s.settle();
		expect(s.port.queue).toEqual([]);
		// p1 landed: looked up. p2 did not: sent again. Neither twice.
		expect(s.transport.rows.size).toBe(2);
		expect(s.transport.batches.filter((b) => b.some((o) => o.op.recordId === 'p1'))).toHaveLength(1);
		expect(s.transport.batches.filter((b) => b.some((o) => o.op.recordId === 'p2'))).toHaveLength(2);
		expect(s.transport.count('lookup')).toBe(1);
	});

	it('runs one drain at a time', async () => {
		const s = setup();
		await shoot(s);
		const [a, b] = await Promise.all([s.runner.drain(), s.runner.drain()]);
		expect(a).toBe(b);
		expect(s.transport.batches).toHaveLength(5);
	});

	it('reports progress down to zero', async () => {
		const s = setup();
		await shoot(s);
		await s.runner.drain();
		const counts = s.progress.map((p) => p.unsynced.entries);
		expect(counts[0]).toBe(7);
		expect(counts.at(-1)).toBe(0);
		expect([...counts].sort((a, b) => b - a)).toEqual(counts);
		expect(s.progress.at(-1)).toMatchObject({ phase: 'stopped', stopped: 'idle' });
		expect(s.progress.some((p) => p.phase === 'uploading' && p.upload?.sent === 10 && p.upload.total === 10)).toBe(true);
	});
});

describe('crash mid-batch', () => {
	it('re-verifies entries left in flight: confirms what landed, resends what did not', async () => {
		const s = setup();
		await s.add(create('project', 'p1', { name: 'A' }));
		await s.add(create('project', 'p2', { name: 'B' }));
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		await s.add(update('take', 't2', { tStop: [2.8, 4] }));
		await s.add(del('take', 't3'));
		const t1 = s.transport.seed('take', 't1', { tStop: 4 });
		const t2 = s.transport.seed('take', 't2', { tStop: 2.8 });
		s.port.remotes.set('t1', t1).set('t2', t2).set('t3', 999);
		// The app died with all five in flight. p1, the t1 edit and the t3 delete had landed.
		s.transport.seed('project', 'p1', { name: 'A' });
		s.port.queue = s.port.queue.map((e) => ({ ...e, state: 'inFlight' as const, attempts: 1 }));

		// A new page, a new runner.
		const report = await s.settle();
		expect(report.unsynced.entries).toBe(0);
		expect(s.transport.batches.map(kinds)).toEqual([['create p2', 'update t2']]);
		expect(s.transport.rows.get('t2')!.fields.tStop).toBe(4);
		expect(s.port.remotes.get('p1')).toBe(s.transport.rows.get('p1')!.remoteId);
		expect(s.port.remotes.has('t3')).toBe(false);
	});

	it('re-verifies an upload left in flight before uploading again', async () => {
		const s = setup();
		const remote = s.transport.seed('still', 'ph1');
		s.port.remotes.set('ph1', remote);
		s.photo('ph1');
		await s.add(blob('ph1'));
		s.transport.files.set('ph1', { blobId: 'ph1', remoteId: 'file-0', size: 10 });
		s.port.queue = s.port.queue.map((e) => ({ ...e, state: 'inFlight' as const, attempts: 1 }));
		await s.settle();
		expect(s.transport.count('beginUpload')).toBe(0);
		expect(s.port.verified.get('ph1')).toBe('file-0');
	});
});

describe('timeout', () => {
	it('after the batch committed: found by client UUID, never sent twice', async () => {
		const s = setup();
		await s.add(create('project', 'p1'));
		await s.add(create('shootDay', 'd1'), ['p1']);
		s.transport.timeoutNext('push', true);
		const first = await s.runner.drain();
		expect(first.stopped).toBe('waiting');
		expect(first.waitUntil).toBeGreaterThan(s.clock.t);
		expect(s.port.queue.map((e) => e.state)).toEqual(['sentUnconfirmed', 'pending']);

		await s.settle();
		expect(s.port.queue).toEqual([]);
		expect(s.transport.batches.map(kinds)).toEqual([['create p1'], ['create d1']]);
		expect(s.port.remotes.get('p1')).toBe(s.transport.rows.get('p1')!.remoteId);
	});

	it('before the batch committed: sent again after the check', async () => {
		const s = setup();
		await s.add(create('project', 'p1'));
		s.transport.failNext('push', 'timeout');
		await s.settle();
		expect(s.port.queue).toEqual([]);
		expect(s.transport.count('push')).toBe(2);
		expect(s.transport.count('lookup')).toBe(1);
		expect(s.transport.rows.size).toBe(1);
	});

	it('of an update that committed: the server values show it landed', async () => {
		const s = setup();
		s.port.remotes.set('t1', s.transport.seed('take', 't1', { tStop: 2.8 }));
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		s.transport.timeoutNext('push', true);
		await s.settle();
		expect(s.transport.count('push')).toBe(1);
		expect(s.port.queue).toEqual([]);
	});

	it('when the check itself fails, checks again later and still does not resend blind', async () => {
		const s = setup();
		await s.add(create('project', 'p1'));
		s.transport.timeoutNext('push', true);
		s.transport.failNext('lookup', 'failed', 2);
		await s.settle();
		expect(s.transport.count('push')).toBe(1);
		expect(s.transport.count('lookup')).toBe(3);
		expect(s.port.queue).toEqual([]);
	});
});

describe('duplicate refused', () => {
	it('means already created: looked up by client UUID, the rest of the batch goes again', async () => {
		const s = setup();
		const existing = s.transport.seed('project', 'p1', { name: 'A' });
		await s.add(create('project', 'p1', { name: 'A' }));
		await s.add(create('project', 'p2', { name: 'B' }));
		await s.settle();
		expect(s.port.queue).toEqual([]);
		expect(s.port.remotes.get('p1')).toBe(existing);
		expect(s.transport.batches.map(kinds)).toEqual([['create p1', 'create p2'], ['create p2']]);
		expect(s.transport.rows.size).toBe(2);
	});
});

describe('server trouble', () => {
	it('a passing failure is retried with backoff', async () => {
		const s = setup();
		await s.add(create('project', 'p1'));
		s.transport.failNext('push', 'failed', 2);
		const first = await s.runner.drain();
		expect(first).toMatchObject({ stopped: 'waiting', waitUntil: s.clock.t + 2000 });
		expect(s.port.queue[0]).toMatchObject({ state: 'failedRetryable', attempts: 1 });
		expect((await s.runner.drain()).stopped).toBe('waiting');
		expect(s.transport.count('push')).toBe(1);
		await s.settle();
		expect(s.transport.count('push')).toBe(3);
		expect(s.port.queue).toEqual([]);
	});

	it('gives up after the attempts allowed and asks for attention; retry starts over', async () => {
		const s = setup({ maxAttempts: 3 });
		await s.add(create('project', 'p1'));
		await s.add(create('shootDay', 'd1'), ['p1']);
		s.transport.failNext('push', 'failed', 3);
		const report = await s.settle();
		expect(report.stopped).toBe('idle');
		expect(report.unsynced).toMatchObject({ entries: 2, attention: 1 });
		expect(s.port.queue[0]).toMatchObject({ state: 'needsAttention', attention: { reason: 'attempts' } });
		expect(s.port.queue[1].state).toBe('pending');

		await s.port.update((q) => retry(q, q[0].id));
		expect((await s.settle()).unsynced.entries).toBe(0);
	});

	it('an operation the server will never take needs attention; the others go on', async () => {
		const s = setup();
		await s.add(create('project', 'p1', { invalid: true }));
		await s.add(create('project', 'p2'));
		await s.add(create('shootDay', 'd1'), ['p1']);
		const report = await s.settle();
		expect(report.unsynced).toMatchObject({ entries: 2, attention: 1 });
		expect(s.port.queue[0]).toMatchObject({ state: 'needsAttention', attention: { reason: 'refused', message: 'invalid' } });
		expect(s.transport.rows.has('p2')).toBe(true);
		expect(s.transport.rows.has('d1')).toBe(false);
	});

	it('stops when the session is gone and counts no attempt', async () => {
		const s = setup();
		await s.add(create('project', 'p1'));
		s.transport.authorized = false;
		expect((await s.runner.drain()).stopped).toBe('unauthorized');
		expect(s.port.queue[0]).toMatchObject({ state: 'pending', attempts: 0 });
	});

	it('an update to a record the server no longer has needs attention', async () => {
		const s = setup();
		s.port.remotes.set('t1', 5);
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		await s.settle();
		expect(s.port.queue[0]).toMatchObject({ state: 'needsAttention', attention: { reason: 'gone' } });
	});

	it('a delete of a record the server no longer has is done', async () => {
		const s = setup();
		s.port.remotes.set('t1', 5);
		await s.add(del('take', 't1'));
		await s.settle();
		expect(s.port.queue).toEqual([]);
		expect(s.port.remotes.has('t1')).toBe(false);
	});
});

describe('conflict', () => {
	async function conflicted() {
		const s = setup();
		s.port.remotes.set('t1', s.transport.seed('take', 't1', { tStop: 2.8, iso: 800 }));
		await s.add(update('take', 't1', { tStop: [2.8, 4], iso: [800, 1600] }));
		s.transport.serverEdit('t1', { tStop: 5.6 });
		const report = await s.settle();
		return { s, report };
	}

	it('is surfaced: nothing is overwritten, nothing is dropped', async () => {
		const { s, report } = await conflicted();
		expect(report.unsynced).toMatchObject({ entries: 1, attention: 1 });
		expect(s.port.queue[0]).toMatchObject({
			state: 'needsAttention',
			attention: { reason: 'conflict', conflicts: [{ key: 'tStop', base: 2.8, local: 4, server: 5.6 }] }
		});
		expect(s.transport.count('push')).toBe(0);
		expect(s.transport.rows.get('t1')!.fields).toEqual({ tStop: 5.6, iso: 800 });
	});

	it('keeping ours sends it', async () => {
		const { s } = await conflicted();
		await s.port.update((q) => resolveConflict(q, q[0].id, () => 'mine').queue);
		await s.settle();
		expect(s.transport.rows.get('t1')!.fields).toEqual({ tStop: 4, iso: 1600 });
		expect(s.port.queue).toEqual([]);
	});

	it('taking theirs sends only the fields that did not conflict', async () => {
		const { s } = await conflicted();
		await s.port.update((q) => resolveConflict(q, q[0].id, () => 'theirs').queue);
		await s.settle();
		expect(s.transport.rows.get('t1')!.fields).toEqual({ tStop: 5.6, iso: 1600 });
	});

	it('the same value on both sides is no conflict and is not sent', async () => {
		const s = setup();
		s.port.remotes.set('t1', s.transport.seed('take', 't1', { tStop: 4 }));
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		await s.settle();
		expect(s.port.queue).toEqual([]);
		expect(s.transport.count('push')).toBe(0);
	});
});

describe('undo', () => {
	it('of an edit not yet sent sends nothing', async () => {
		const s = setup();
		s.port.remotes.set('t1', s.transport.seed('take', 't1', { tStop: 2.8 }));
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		await s.add(update('take', 't1', { tStop: [4, 2.8] }));
		await s.settle();
		expect(s.transport.calls).toEqual([]);
	});

	it('of an edit already sent sends the inverse', async () => {
		const s = setup();
		s.port.remotes.set('t1', s.transport.seed('take', 't1', { tStop: 2.8 }));
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		await s.settle();
		expect(s.transport.rows.get('t1')!.fields.tStop).toBe(4);
		await s.add(update('take', 't1', { tStop: [4, 2.8] }));
		await s.settle();
		expect(s.transport.rows.get('t1')!.fields.tStop).toBe(2.8);
		expect(s.transport.count('push')).toBe(2);
	});

	it('of an edit in flight is queued behind it and sent after', async () => {
		const s = setup();
		s.port.remotes.set('t1', s.transport.seed('take', 't1', { tStop: 2.8 }));
		await s.add(update('take', 't1', { tStop: [2.8, 4] }));
		let once = true;
		s.transport.onCall = async (method) => {
			if (method !== 'push' || !once) return;
			once = false;
			await s.add(update('take', 't1', { tStop: [4, 2.8] }));
		};
		await s.settle();
		expect(s.transport.batches.map((b) => (b[0].op.kind === 'update' ? b[0].op.changes.tStop.value : null))).toEqual([4, 2.8]);
		expect(s.transport.rows.get('t1')!.fields.tStop).toBe(2.8);
	});
});

describe('upload', () => {
	async function still(s: ReturnType<typeof setup>, size: number) {
		s.port.remotes.set('ph1', s.transport.seed('still', 'ph1'));
		s.photo('ph1', size);
		await s.add(blob('ph1', 'ph1', size));
	}

	it('sends the file in the parts the transport asks for', async () => {
		const s = setup();
		s.transport.partSize = 4;
		await still(s, 10);
		await s.settle();
		const parts = s.transport.calls.filter((c) => c.method === 'uploadPart').map((c) => (c.detail as { index: number }).index);
		expect(parts).toEqual([0, 1, 2]);
		expect(s.transport.files.get('ph1')!.size).toBe(10);
	});

	it('is confirmed only after it is verified', async () => {
		const s = setup();
		await still(s, 10);
		s.transport.onCall = (method) => {
			if (method === 'verifyUpload') expect(s.port.verified.has('ph1')).toBe(false);
		};
		await s.settle();
		expect(s.transport.count('verifyUpload')).toBe(1);
		expect(s.port.verified.get('ph1')).toBe('file-1');
	});

	it('an upload that answered and is not there is sent again', async () => {
		const s = setup();
		await still(s, 10);
		s.transport.loseNextUpload();
		const first = await s.runner.drain();
		expect(first.stopped).toBe('waiting');
		expect(s.port.queue[0].state).toBe('failedRetryable');
		expect(s.port.verified.has('ph1')).toBe(false);
		await s.settle();
		expect(s.transport.count('beginUpload')).toBe(2);
		expect(s.port.verified.get('ph1')).toBe('file-2');
	});

	it('a URL that expires mid-upload is renewed and the upload carries on', async () => {
		const s = setup();
		s.transport.partSize = 5;
		s.transport.partDurationMs = 300_000;
		await still(s, 20);
		await s.settle();
		expect(s.transport.count('beginUpload')).toBe(1);
		expect(s.transport.count('renewUpload')).toBeGreaterThanOrEqual(1);
		// No part was started on a URL about to die, so none was sent twice.
		expect(s.transport.count('uploadPart')).toBe(4);
		expect(s.transport.files.get('ph1')!.size).toBe(20);
		expect(s.port.queue).toEqual([]);
	});

	it('an expired upload that cannot be continued starts again from the first part', async () => {
		const s = setup();
		s.transport.partSize = 5;
		s.transport.resumable = false;
		await still(s, 10);
		s.transport.onCall = (method) => {
			// The second part stalls past the life of the URL.
			if (method === 'uploadPart' && s.transport.count('uploadPart') === 2) s.clock.t += 900_000;
		};
		await s.settle();
		expect(s.transport.count('beginUpload')).toBe(2);
		expect(s.transport.count('uploadPart')).toBe(4);
		expect(s.transport.files.get('ph1')!.size).toBe(10);
		expect(s.port.verified.has('ph1')).toBe(true);
	});

	it('gives up on URLs that keep expiring with no part sent, and retries later', async () => {
		const s = setup({ urlRenewals: 2 });
		await still(s, 10);
		s.transport.failNext('uploadPart', 'expired', 3);
		const first = await s.runner.drain();
		expect(first.stopped).toBe('waiting');
		expect(s.port.queue[0].state).toBe('failedRetryable');
		await s.settle();
		expect(s.port.verified.has('ph1')).toBe(true);
	});

	it('retries a part that failed, without starting over', async () => {
		const s = setup();
		s.transport.partSize = 5;
		await still(s, 10);
		s.transport.failNext('uploadPart', 'failed', 2);
		await s.runner.drain();
		expect(s.transport.count('uploadPart')).toBe(4);
		expect(s.transport.count('beginUpload')).toBe(1);
		expect(s.port.queue).toEqual([]);
	});

	it('a timeout mid-upload is checked before the file is sent again', async () => {
		const s = setup();
		await still(s, 10);
		s.transport.timeoutNext('finishUpload', true);
		await s.settle();
		expect(s.transport.count('beginUpload')).toBe(1);
		expect(s.port.verified.has('ph1')).toBe(true);
	});

	it('a file the store no longer has needs attention', async () => {
		const s = setup();
		s.port.remotes.set('ph1', s.transport.seed('still', 'ph1'));
		await s.add(blob('ph1'));
		await s.settle();
		expect(s.port.queue[0]).toMatchObject({ state: 'needsAttention', attention: { reason: 'blobMissing' } });
		expect(s.transport.count('beginUpload')).toBe(0);
	});

	it('uploads one file after another', async () => {
		const s = setup();
		s.port.remotes.set('ph1', s.transport.seed('still', 'ph1'));
		for (const id of ['a', 'b', 'c']) {
			s.photo(id);
			await s.add(blob('ph1', id));
		}
		await s.settle();
		expect([...s.transport.files.keys()]).toEqual(['a', 'b', 'c']);
	});
});

describe('a transport that answers nonsense', () => {
	it('a refusal that names no operation is a failure, not a loop', async () => {
		const s = setup();
		await s.add(create('project', 'p1'));
		const push = s.transport.push;
		s.transport.push = async () => ({ outcome: 'refused', refusals: [] });
		expect((await s.runner.drain()).stopped).toBe('waiting');
		const entry: Entry = s.port.queue[0];
		expect(entry.state).toBe('failedRetryable');
		s.transport.push = push;
		expect((await s.settle()).unsynced.entries).toBe(0);
	});

	it('an applied batch that names no server id for a create is checked by lookup', async () => {
		const s = setup();
		await s.add(create('project', 'p1'));
		const push = s.transport.push;
		s.transport.push = async (ops) => {
			await push(ops);
			return { outcome: 'applied', remoteIds: {} };
		};
		await s.settle();
		expect(s.port.remotes.get('p1')).toBe(s.transport.rows.get('p1')!.remoteId);
	});
});
