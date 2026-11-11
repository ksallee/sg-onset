import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markApplied, markInFlight } from '$lib/outbox/machine';
import { fakeTransport } from '$lib/outbox/fakeTransport';
import { createRunner } from '$lib/outbox/runner';
import type { Entry } from '$lib/outbox/types';
import { exportBackup, importBackup, memorySink, saveBackup } from '../backup';
import { openStore, type StoreOptions } from '../dexieStore';
import { VERSIONS, type SchemaVersion } from '../schema';
import { TABLES } from '../tables';
import { readZip } from '../zipRead';
import { backupSignals } from './signals';
import { SnapshotError } from './snapshots';

let n = 0;
const DAY = 24 * 3600_000;

function setup(options: Partial<StoreOptions> = {}) {
	const clock = { t: 100 * DAY };
	const idb = options.indexedDB ?? new IDBFactory();
	const store = openStore({
		name: 'snap',
		indexedDB: idb,
		IDBKeyRange,
		now: () => clock.t,
		uuid: () => `u${++n}`,
		persisted: async () => true,
		estimate: async () => ({ usage: 0, quota: 10 * 1024 ** 3 }),
		...options
	});
	return { clock, idb, store };
}
type S = ReturnType<typeof setup>;

afterEach(() => vi.restoreAllMocks());

/** A second handle on the same database, to look at or damage what the store wrote. */
function raw(s: S): Dexie {
	const db = new Dexie('snap', { indexedDB: s.idb, IDBKeyRange });
	for (const v of VERSIONS) db.version(v.version).stores(v.stores);
	return db;
}

const photo = (size = 200_000) => new Blob([new Uint8Array(size).fill(7)], { type: 'image/jpeg' });

/** A shoot as a wrangler leaves it: a project, gear, two days, slates, takes, photos. */
async function shoot({ store }: S, slates = 4, takes = 3) {
	await store.create('project', { id: 'p1', name: 'Show' });
	await store.create('camera', { id: 'c1', projectId: 'p1', cameraModel: 'Alexa 35' });
	await store.create('lens', { id: 'l1', projectId: 'p1', lensModel: 'Signature 35', lensSerialNumber: 'L-35' });
	await store.create('cameraSetup', { id: 'cs1', projectId: 'p1', cameraLabel: 'A', cameraId: 'c1', lensId: 'l1' });
	for (const d of [1, 2]) {
		await store.create('shootDay', { id: `d${d}`, projectId: 'p1', shootDate: `2026-11-1${d}`, shootDay: d });
		for (let s = 1; s <= slates; s++) {
			await store.create('slate', { id: `d${d}s${s}`, shootDayId: `d${d}`, slateUID: `${s}A` });
			for (let t = 1; t <= takes; t++) {
				await store.create('take', { id: `d${d}s${s}t${t}`, slateId: `d${d}s${s}`, cameraSetupId: 'cs1', take: String(t), tStop: 2.8, notes: `take ${t}` });
			}
		}
	}
	await store.create('still', { id: 'ph1', takeId: 'd1s1t1', capturedAt: '2026-11-11T09:00:00Z' }, { blob: photo(), id: 'b1' });
}

async function everything({ store }: S) {
	const out: Record<string, unknown[]> = {};
	for (const table of TABLES) out[table] = (await store.list(table)).sort((a, b) => a.id.localeCompare(b.id));
	return out;
}

/** Marks everything queued as taken by the server, as a drain would. */
async function confirmAll({ store }: S, only: (e: Entry) => boolean = () => true) {
	let server = 500;
	await store.outbox.update((q) => {
		const mine = q.filter(only);
		return markApplied(
			markInFlight(
				q,
				mine.map((e) => e.id)
			),
			mine.map((e) => ({ id: e.id, ...(e.op.kind === 'create' ? { remoteId: server++ } : {}) }))
		);
	});
}

function sync(s: S) {
	const transport = fakeTransport(s.clock);
	const runner = createRunner({ port: s.store.outbox, transport, env: { now: () => s.clock.t, visible: () => true, online: () => true, random: () => 1 } });
	const settle = async () => {
		for (let i = 0; i < 30; i++) {
			const report = await runner.drain();
			if (report.stopped !== 'waiting') return report;
			s.clock.t = report.waitUntil!;
		}
		throw new Error('never settled');
	};
	return { transport, settle };
}

describe('take and list', () => {
	it('lists a snapshot with its time, reason, counts, size, and checks it', async () => {
		const s = setup();
		await shoot(s);
		const info = await s.store.snapshots.take('manual');
		expect(info).toMatchObject({ at: s.clock.t, reason: 'manual', kind: 'risky', schemaVersion: s.store.schemaVersion, verified: true });
		expect(info!.counts).toMatchObject({ project: 1, shootDay: 2, slate: 8, take: 24, still: 1, camera: 1 });
		expect(info!.records).toBe(1 + 1 + 1 + 1 + 2 + 8 + 24 + 1);
		expect(await s.store.snapshots.list()).toEqual([info]);
	});

	it('copies no photo bytes: it names the files instead', async () => {
		const s = setup();
		await shoot(s);
		const info = await s.store.snapshots.take('manual');
		expect(info!.size).toBeLessThan(20_000);
		const db = raw(s);
		const [meta] = await db.table('snapshots').toArray();
		db.close();
		expect(meta.blobIds).toEqual(['b1']);
		expect(meta.encoding).toBe('zip+gzip');
	});

	it('holds the queue, the server ids and the trash too', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s, (e) => e.op.recordId === 'p1');
		await s.store.remove('take', 'd2s4t3');
		const [info] = [await s.store.snapshots.take('manual')];
		expect(info!.counts).toMatchObject({ remotes: 1, trash: 1, take: 23 });
		expect(info!.counts.outbox).toBeGreaterThan(0);
	});

	it('is in the backup layout: the existing import takes it into an empty store, photos aside', async () => {
		const s = setup();
		await shoot(s);
		const info = await s.store.snapshots.take('manual');
		const zip = await s.store.snapshots.zip(info!.id);
		const fresh = setup({ name: 'other' });
		const report = await importBackup(fresh.store, zip);
		expect(report.tables.take).toBe(24);
		expect(await everything(fresh)).toEqual(await everything(s));
		expect(report.blobs).toBe(0);
	});

	it('runs retention after each one: the last three automatic snapshots of the day stay', async () => {
		const s = setup();
		await shoot(s);
		for (let i = 0; i < 5; i++) {
			s.clock.t += 60_000;
			await s.store.create('slate', { id: `x${i}`, shootDayId: 'd1' });
			await s.store.snapshots.take('changes');
		}
		const list = await s.store.snapshots.list();
		expect(list).toHaveLength(3);
		expect(list.map((i) => i.at)).toEqual([s.clock.t, s.clock.t - 60_000, s.clock.t - 120_000]);
	});

	it('emits `snapshots` when the list changes', async () => {
		const s = setup();
		await shoot(s);
		const seen: string[][] = [];
		s.store.subscribe((e) => seen.push([...e.tables]));
		await s.store.snapshots.take('manual');
		expect(seen.some((t) => t.includes('snapshots'))).toBe(true);
	});
});

describe('restore', () => {
	it('round trip: a realistic day comes back exactly, after a bad bulk edit and deletes', async () => {
		const s = setup();
		await shoot(s);
		const before = await everything(s);
		const snap = await s.store.snapshots.take('bulkEdit');

		// A template applied to everything, a day deleted, a take added.
		const takes = await s.store.list('take');
		await s.store.apply('take', takes.map((t) => ({ id: t.id, key: 'tStop', from: t.tStop, to: 16 })));
		for (const slate of await s.store.list('slate', 'd2')) await s.store.remove('slate', slate.id);
		await s.store.remove('shootDay', 'd2');
		await s.store.create('take', { id: 'late', slateId: 'd1s1', take: '9' });

		const preview = await s.store.snapshots.preview(snap!.id);
		expect(preview.tables.take).toEqual({ added: 0, removed: 1, changed: 24 });
		expect(preview.tables.slate).toEqual({ added: 4, removed: 0, changed: 0 });
		expect(preview.tables.shootDay).toEqual({ added: 1, removed: 0, changed: 0 });

		const { before: undo } = await s.store.snapshots.restore(snap!.id);
		expect(await everything(s)).toEqual(before);
		expect(undo.reason).toBe('beforeRestore');
		expect(await (await s.store.blob('b1'))!.size).toBe(200_000);
	});

	it('is undoable: restoring the before-restore snapshot gives back what was there', async () => {
		const s = setup();
		await shoot(s);
		const snap = await s.store.snapshots.take('manual');
		await s.store.apply('take', [{ id: 'd1s1t1', key: 'tStop', from: 2.8, to: 8 }]);
		await s.store.create('still', { id: 'ph2', takeId: 'd1s1t2', capturedAt: 'x' }, { blob: photo(50), id: 'b2' });
		const after = await everything(s);
		const { before } = await s.store.snapshots.restore(snap!.id);
		expect((await s.store.get('take', 'd1s1t1'))!.tStop).toBe(2.8);
		expect(await s.store.get('still', 'ph2')).toBeUndefined();
		await s.store.snapshots.restore(before.id);
		expect(await everything(s)).toEqual(after);
		expect((await s.store.blob('b2'))!.size).toBe(50);
	});

	it('leaves a queue that sends the unsent snapshot state, and nothing twice', async () => {
		const s = setup();
		const { transport, settle } = sync(s);
		await shoot(s, 1, 1);
		const snap = await s.store.snapshots.take('manual');
		await s.store.snapshots.restore(snap!.id);
		await settle();
		expect(transport.violations).toEqual([]);
		expect(transport.rows.get('d1s1t1')!.fields).toMatchObject({ tStop: 2.8 });
		expect(transport.count('push')).toBeGreaterThan(0);
		expect((await s.store.unsynced()).entries).toBe(0);
	});

	describe('against Flow PT', () => {
		it('a record created and synced after the snapshot is deleted on Flow PT', async () => {
			const s = setup();
			const { transport, settle } = sync(s);
			await shoot(s, 1, 1);
			await settle();
			const snap = await s.store.snapshots.take('manual');
			await s.store.create('take', { id: 'late', slateId: 'd1s1', take: '2' });
			await settle();
			expect(transport.rows.has('late')).toBe(true);

			await s.store.snapshots.restore(snap!.id);
			const queued = await s.store.outbox.entries();
			expect(queued.map((e) => `${e.op.kind} ${e.op.recordId}`)).toEqual(['delete late']);
			await settle();
			expect(transport.rows.has('late')).toBe(false);
			expect(transport.violations).toEqual([]);
		});

		it('a record deleted after the snapshot, the delete sent, is created again; nothing synced is resent as a create', async () => {
			const s = setup();
			const { transport, settle } = sync(s);
			await shoot(s, 1, 2);
			await settle();
			const snap = await s.store.snapshots.take('manual');
			await s.store.remove('take', 'd1s1t2');
			await settle();
			expect(transport.rows.has('d1s1t2')).toBe(false);

			await s.store.snapshots.restore(snap!.id);
			const queued = await s.store.outbox.entries();
			expect(queued.map((e) => `${e.op.kind} ${e.op.recordId}`)).toEqual(['create d1s1t2']);
			await settle();
			expect(transport.rows.get('d1s1t2')!.fields).toMatchObject({ take: '2', tStop: 2.8 });
			expect(await s.store.get('take', 'd1s1t2')).toBeDefined();
			expect(transport.violations).toEqual([]);
		});

		it('a change synced after the snapshot is sent back as an update', async () => {
			const s = setup();
			const { transport, settle } = sync(s);
			await shoot(s, 1, 1);
			await settle();
			const snap = await s.store.snapshots.take('manual');
			await s.store.apply('take', [{ id: 'd1s1t1', key: 'tStop', from: 2.8, to: 11 }]);
			await settle();
			await s.store.snapshots.restore(snap!.id);
			const [entry] = await s.store.outbox.entries();
			expect(entry.op).toEqual({ kind: 'update', table: 'take', recordId: 'd1s1t1', changes: { tStop: { base: 11, value: 2.8 } } });
			await settle();
			expect(transport.rows.get('d1s1t1')!.fields.tStop).toBe(2.8);
		});

		it('a photo added and synced after the snapshot: its record is deleted on Flow PT, its bytes stay for the undo', async () => {
			const s = setup();
			const { transport, settle } = sync(s);
			await shoot(s, 1, 1);
			await settle();
			const snap = await s.store.snapshots.take('manual');
			await s.store.create('still', { id: 'ph2', takeId: 'd1s1t1', capturedAt: 'x' }, { blob: photo(64), id: 'b2' });
			await settle();
			expect(transport.files.has('b2')).toBe(true);

			await s.store.snapshots.restore(snap!.id);
			expect((await s.store.outbox.entries()).map((e) => `${e.op.kind} ${e.op.recordId}`)).toEqual(['delete ph2']);
			await settle();
			expect(transport.rows.has('ph2')).toBe(false);
			expect(await s.store.get('still', 'ph2')).toBeUndefined();
			expect(await s.store.blob('b2')).toBeDefined();
		});

		it('a photo in the snapshot whose record was deleted and confirmed comes back with its bytes', async () => {
			const s = setup();
			const { transport, settle } = sync(s);
			await shoot(s, 1, 1);
			await settle();
			const snap = await s.store.snapshots.take('manual');
			await s.store.remove('still', 'ph1');
			await settle();
			expect(await s.store.blobsOf('ph1')).toEqual([]);

			await s.store.snapshots.restore(snap!.id);
			expect((await s.store.blob('b1'))!.size).toBe(200_000);
			await settle();
			expect(transport.rows.has('ph1')).toBe(true);
			expect(transport.violations).toEqual([]);
		});
	});

	it('refuses a snapshot taken by a later version of the app', async () => {
		// Taken under a later schema, then found in this store: copied over by hand.
		const later = setup({ name: 'later', versions: [...VERSIONS, { version: VERSIONS.length + 1, stores: {} }] });
		await shoot(later, 1, 1);
		const snap = await later.store.snapshots.take('manual');
		const from = new Dexie('later', { indexedDB: later.idb, IDBKeyRange });
		for (const v of [...VERSIONS, { version: VERSIONS.length + 1, stores: {} }]) from.version(v.version).stores(v.stores);
		const row = await from.table('snapshots').get(snap!.id);
		const data = await from.table('snapshotData').get(snap!.id);
		from.close();

		const s = setup({ indexedDB: later.idb, name: 'snap' });
		await shoot(s, 1, 1);
		const db = raw(s);
		await db.table('snapshots').put(row);
		await db.table('snapshotData').put(data);
		db.close();
		await expect(s.store.snapshots.restore(snap!.id)).rejects.toMatchObject({ reason: 'newerSchema' });
	});

	it('refuses an unknown snapshot', async () => {
		const s = setup();
		await expect(s.store.snapshots.restore('nope')).rejects.toBeInstanceOf(SnapshotError);
	});
});

describe('integrity', () => {
	async function bend(s: S, id: string) {
		const db = raw(s);
		const row = await db.table('snapshotData').get(id);
		const bytes = new Uint8Array(await row.data.arrayBuffer());
		bytes[bytes.length >> 1] ^= 0xff;
		await db.table('snapshotData').put({ id, data: new Blob([bytes]) });
		db.close();
	}

	it('a snapshot that fails its check is marked bad, skipped, never restored', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		const good = await s.store.snapshots.take('manual');
		s.clock.t += 1000;
		const bad = await s.store.snapshots.take('manual');
		await bend(s, bad!.id);

		expect(await s.store.snapshots.verify(bad!.id)).toBe(false);
		await expect(s.store.snapshots.restore(bad!.id)).rejects.toMatchObject({ reason: 'bad' });
		const list = await s.store.snapshots.list();
		expect(list.find((i) => i.id === bad!.id)!.verified).toBe(false);
		expect((await s.store.snapshots.last())!.at).toBe(good!.at);
		const status = await s.store.snapshots.status();
		expect(status.newestBad).toBe(true);
		// Retention drops it.
		await s.store.snapshots.prune();
		expect((await s.store.snapshots.list()).map((i) => i.id)).toEqual([good!.id]);
	});

	it('verifies every snapshot when asked to list them checked', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		const one = await s.store.snapshots.take('manual');
		await bend(s, one!.id);
		const [listed] = await s.store.snapshots.list({ verify: true });
		expect(listed.verified).toBe(false);
	});
});

describe('crashes', () => {
	it('an aborted snapshot writes nothing and leaves the previous one intact', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		const first = await s.store.snapshots.take('manual');
		await s.store.create('slate', { id: 'x', shootDayId: 'd1' });
		const ctrl = new AbortController();
		const pending = s.store.snapshots.take('changes', { signal: ctrl.signal });
		ctrl.abort();
		expect(await pending).toBeUndefined();
		expect((await s.store.snapshots.list()).map((i) => i.id)).toEqual([first!.id]);
	});

	it('the app dying mid-snapshot leaves the previous one intact and no stray bytes', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		const first = await s.store.snapshots.take('manual');
		await s.store.create('slate', { id: 'x', shootDayId: 'd1' });
		const pending = s.store.snapshots.take('changes');
		s.store.close();
		await expect(pending).rejects.toThrow();

		const again = setup({ indexedDB: s.idb });
		const list = await again.store.snapshots.list({ verify: true });
		expect(list.map((i) => [i.id, i.verified])).toEqual([[first!.id, true]]);
		const db = raw(again);
		expect(await db.table('snapshotData').toCollection().primaryKeys()).toEqual([first!.id]);
		db.close();
	});
});

describe('the photo bytes a snapshot names', () => {
	it('are not pruned while a snapshot is kept, and are once none names them', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		await confirmAll(s);
		expect((await s.store.blobsOf('ph1'))[0].verifiedAt).toBeDefined();
		const snap = await s.store.snapshots.take('manual');
		s.clock.t += 30 * DAY;
		expect(await s.store.pruneBlobs()).toBe(0);
		expect(await s.store.blob('b1')).toBeDefined();

		await s.store.snapshots.drop([snap!.id]);
		expect(await s.store.pruneBlobs()).toBe(1);
		expect(await s.store.blob('b1')).toBeUndefined();
	});

	it('survive the confirmed delete of their record while a snapshot names them, and go with the snapshot', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		await confirmAll(s);
		const snap = await s.store.snapshots.take('manual');
		await s.store.remove('still', 'ph1');
		await confirmAll(s);
		expect(await s.store.blobsOf('ph1')).toEqual([]);
		expect(await s.store.blob('b1')).toBeDefined();

		await s.store.snapshots.drop([snap!.id]);
		expect(await s.store.blob('b1')).toBeUndefined();
	});

	it('survive a zip restore that empties the store, and stay out of the next backup', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		const zip = await saveBackup(exportBackup(s.store, { now: 0 }), memorySink());
		await s.store.create('still', { id: 'ph2', takeId: 'd1s1t1', capturedAt: 'x' }, { blob: photo(64), id: 'b2' });
		await s.store.snapshots.take('zipRestore');
		await importBackup(s.store, zip, { replace: true });
		expect(await s.store.get('still', 'ph2')).toBeUndefined();
		expect(await s.store.blob('b2')).toBeDefined();

		const next = await saveBackup(exportBackup(s.store, { now: 0 }), memorySink());
		const names = (await readZip(next)).map((e) => e.name).filter((p) => p.startsWith('blobs/'));
		expect(names).toEqual(['blobs/b1']);
	});
});

describe('migration', () => {
	const v1 = VERSIONS.slice(0, 1);
	const bump = (upgrade: SchemaVersion['upgrade']): SchemaVersion => ({ version: VERSIONS.length + 1, stores: {}, upgrade });

	it('takes a snapshot before the store is upgraded, of the rows as they were', async () => {
		const s = setup({ versions: v1 });
		await shoot(s, 1, 2);
		s.store.close();
		const again = setup({ indexedDB: s.idb });
		const [snap] = await again.store.snapshots.list({ verify: true });
		expect(snap).toMatchObject({ reason: 'migration', schemaVersion: 1, verified: true });
		expect(snap.counts.take).toBe(4);
	});

	it('a migration that goes wrong can be rolled back from that snapshot', async () => {
		const s = setup();
		await shoot(s, 1, 2);
		const before = await everything(s);
		s.store.close();

		const buggy = bump(async (tx) => {
			await tx.table('take').clear();
		});
		const again = setup({ indexedDB: s.idb, versions: [...VERSIONS, buggy] });
		expect(await again.store.list('take')).toEqual([]);
		const snap = (await again.store.snapshots.list()).find((i) => i.reason === 'migration')!;
		expect(snap.schemaVersion).toBe(VERSIONS.length);
		await expect(again.store.snapshots.restore(snap.id)).rejects.toMatchObject({ reason: 'olderSchema' });
		await again.store.snapshots.restore(snap.id, { acceptOlderSchema: true });
		expect(await everything(again)).toEqual(before);
	});

	it('a migration that throws changes nothing: the store opens as it was', async () => {
		const s = setup();
		await shoot(s, 1, 2);
		const before = await everything(s);
		s.store.close();

		const broken = bump(async () => {
			throw new Error('boom');
		});
		const failed = setup({ indexedDB: s.idb, versions: [...VERSIONS, broken] });
		await expect(failed.store.list('take')).rejects.toThrow();
		failed.store.close();

		const again = setup({ indexedDB: s.idb });
		expect(await everything(again)).toEqual(before);
		expect(await again.store.snapshots.list()).toEqual([]);
	});
});

describe('off-device copies and signals', () => {
	it('keeps the time of the last export and of the last full sync', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		await s.store.snapshots.take('manual');
		expect(await s.store.snapshots.markOffDevice('sync', s.clock.t)).toBe(false);
		await s.store.snapshots.markOffDevice('export', s.clock.t);
		await confirmAll(s);
		expect(await s.store.snapshots.markOffDevice('sync', s.clock.t + 5)).toBe(true);
		const status = await s.store.snapshots.status();
		expect(status.offDevice).toEqual({ export: s.clock.t, exportSeq: status.seq, sync: s.clock.t + 5 });
		expect(status.queue.entries).toBe(0);
		expect(backupSignals(status, s.clock.t + 10).severity).toBe('ok');
	});

	it('gives the facts the signals need', async () => {
		const s = setup();
		await shoot(s, 1, 1);
		await s.store.snapshots.take('changes');
		s.clock.t += 2 * DAY;
		await s.store.create('slate', { id: 'x', shootDayId: 'd1' });
		const status = await s.store.snapshots.status();
		const signals = backupSignals(status, s.clock.t + 3600_000 * 2);
		expect(signals.localOnly.records).toBeGreaterThan(0);
		expect(signals.severity).toBe('warn');
		expect(signals.reasons).toContain('localOnlyDay');
		expect(signals.reasons).toContain('snapshotStale');
	});
});

describe('performance', () => {
	it('a snapshot of 2,000 takes completes within budget and never holds a write transaction on the records', async () => {
		const s = setup();
		await s.store.create('project', { id: 'p1', name: 'Show' });
		await s.store.create('shootDay', { id: 'd1', projectId: 'p1' });
		await s.store.create('slate', { id: 's1', shootDayId: 'd1' });
		// 2,000 takes and their queue entries, written straight in: 2,000 creates take long here.
		const rows = Array.from({ length: 2000 }, (_, i) => ({ id: `t${i}`, slateId: 's1', take: String(i), tStop: 2.8, focalLength: 35, notes: 'steady' }));
		const db = raw(s);
		await db.table('take').bulkPut(rows);
		await db.table('outbox').bulkPut(
			rows.map(({ id, ...fields }, i) => ({ id: `e${i}`, seq: 10 + i, op: { kind: 'create', table: 'take', recordId: id, fields }, dependsOn: ['s1'], state: 'pending', attempts: 0, createdAt: 0 }))
		);
		await db.table('meta').put({ key: 'seq', value: 2010 });
		db.close();

		const modes: { mode: string; tables: string[] }[] = [];
		const real = Dexie.prototype.transaction;
		vi.spyOn(Dexie.prototype, 'transaction').mockImplementation(function (this: Dexie, mode: string, tables: unknown, fn: unknown) {
			const names = (Array.isArray(tables) ? tables : [tables]).map((t) => (typeof t === 'string' ? t : (t as { name: string }).name));
			modes.push({ mode, tables: names });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (real as any).call(this, mode, tables, fn);
		} as typeof real);

		const started = performance.now();
		const info = await s.store.snapshots.take('changes');
		const took = performance.now() - started;
		expect(info!.counts.take).toBe(2000);
		// Budget in this environment (fake-indexeddb in Node): 3 s. A real iPad should be faster.
		expect(took).toBeLessThan(3000);
		const writes = modes.filter((m) => m.mode !== 'r');
		expect(writes.length).toBeGreaterThan(0);
		for (const w of writes) expect(w.tables.every((t) => t.startsWith('snapshot'))).toBe(true);
	}, 20_000);
});
