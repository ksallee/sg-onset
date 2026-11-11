import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { makeZip } from 'client-zip';
import { describe, expect, it } from 'vitest';
import { markApplied, markInFlight } from '$lib/outbox/machine';
import { MANIFEST_PATH, tablePath } from './archive';
import { BackupError, exportBackup, importBackup, memorySink, saveBackup } from './backup';
import { openStore, type DexieStore } from './dexieStore';
import { SCHEMA_VERSION } from './schema';
import { entryBlob, readZip } from './zipRead';

let n = 0;
function open(name = 'a'): { store: DexieStore; clock: { t: number } } {
	const clock = { t: 1000 };
	const store = openStore({ name, indexedDB: new IDBFactory(), IDBKeyRange, now: () => clock.t, uuid: () => `u${++n}` });
	return { store, clock };
}

const jpeg = Uint8Array.from({ length: 40_000 }, (_, i) => (i * 7) % 256);

/** A store with synced records, unsynced edits, a file, a trashed record and a conflict-free queue. */
async function filled() {
	const { store, clock } = open();
	await store.create('project', { id: 'p1', name: 'Show' });
	await store.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
	await store.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '12A' });
	await store.outbox.update((q) => {
		const ids = q.map((e) => e.id);
		return markApplied(markInFlight(q, ids), ids.map((id, i) => ({ id, remoteId: 100 + i })));
	});
	await store.create('take', { id: 't1', slateId: 's1', take: '1', lensHeight: { m: 1.8288, entered: { text: "6'", system: 'imperial' } } });
	await store.create('take', { id: 't2', slateId: 's1', take: '2' });
	await store.create('still', { id: 'ph1', takeId: 't1', capturedAt: '2026-11-11T10:00:00Z' }, { blob: new Blob([jpeg], { type: 'image/jpeg' }), id: 'ph1', name: 'a.jpg' });
	await store.create('still', { id: 'ph2', takeId: 't1', capturedAt: '2026-11-11T10:01:00Z' }, { blob: new Blob(['heic'], { type: 'image/heic' }), id: 'ph2' });
	await store.apply('slate', [{ id: 's1', key: 'notes', from: undefined, to: 'line one\nline two' }]);
	await store.remove('take', 't2');
	return { store, clock };
}

async function zipOf(store: DexieStore, now = 5000): Promise<Blob> {
	return saveBackup(exportBackup(store, { now }), memorySink());
}

async function snapshot(store: DexieStore) {
	const tables: Record<string, unknown[]> = {};
	for (const name of store.tableNames()) tables[name] = await store.rows(name);
	const blobs: Record<string, { type: string; bytes: number[] }> = {};
	for (const id of await store.blobIds()) {
		const blob = (await store.blob(id))!;
		blobs[id] = { type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())] };
	}
	return { tables, blobs };
}

describe('exportBackup', () => {
	it('writes a zip with a file per table, a file per blob, and the manifest last', async () => {
		const { store } = await filled();
		const zip = await zipOf(store);
		expect(zip.type).toBe('application/zip');
		const entries = await readZip(zip);
		const names = entries.map((e) => e.name);
		expect(names).toEqual([...store.tableNames().map(tablePath), 'blobs/ph1', 'blobs/ph2', MANIFEST_PATH]);
		const manifest = JSON.parse(await (await entryBlob(zip, entries.at(-1)!)).text());
		expect(manifest).toMatchObject({
			format: 'sg-onset-backup',
			formatVersion: 1,
			schemaVersion: SCHEMA_VERSION,
			exportedAt: '1970-01-01T00:00:05.000Z',
			blobs: 2
		});
		expect(manifest.tables).toMatchObject({ project: 1, take: 1, still: 2, trash: 1, blobs: 2 });
	});

	it('stores photos byte for byte, uncompressed', async () => {
		const { store } = await filled();
		const zip = await zipOf(store);
		const entry = (await readZip(zip)).find((e) => e.name === 'blobs/ph1')!;
		expect(entry.method).toBe(0);
		expect(new Uint8Array(await (await entryBlob(zip, entry)).arrayBuffer())).toEqual(jpeg);
	});

	it('hands the zip to the sink in chunks, never as one piece', async () => {
		const { store } = await filled();
		const sizes: number[] = [];
		const inner = memorySink();
		await saveBackup(exportBackup(store, { now: 0 }), { ...inner, write: (chunk) => (sizes.push(chunk.length), inner.write(chunk)) });
		expect(sizes.length).toBeGreaterThan(5);
	});

	it('aborts the sink when the export fails', async () => {
		const { store } = await filled();
		let aborted = false;
		const sink = { ...memorySink(), abort: async () => void (aborted = true) };
		const broken = { ...store, tableNames: store.tableNames, rows: async () => Promise.reject(new Error('read failed')) };
		await expect(saveBackup(exportBackup(broken, { now: 0 }), sink)).rejects.toThrow();
		expect(aborted).toBe(true);
	});
});

describe('importBackup', () => {
	it('restores everything: records, queue, server ids, trash and files', async () => {
		const { store } = await filled();
		const zip = await zipOf(store);
		const target = open('b').store;
		const report = await importBackup(target, zip);
		expect(report).toMatchObject({ blobs: 2, tables: { project: 1, take: 1, still: 2 } });
		expect(await snapshot(target)).toEqual(await snapshot(store));
	});

	it('the restored store carries on: same unsynced count, undo and restore still work, new entries queue behind', async () => {
		const { store } = await filled();
		const target = open('b').store;
		await importBackup(target, await zipOf(store));
		expect(await target.unsynced()).toEqual(await store.unsynced());
		expect(await target.remoteId('p1')).toBe(100);
		expect((await target.blob('ph1'))!.type).toBe('image/jpeg');
		expect(await target.restore('take', 't2')).toBe(true);
		const before = await target.outbox.entries();
		await target.create('take', { id: 't3', slateId: 's1', take: '3' });
		const after = await target.outbox.entries();
		expect(after.at(-1)!.seq).toBeGreaterThan(Math.max(...before.map((e) => e.seq)));
		expect(new Set(after.map((e) => e.id)).size).toBe(after.length);
	});

	it('refuses to import over data unless told to replace it', async () => {
		const { store } = await filled();
		const zip = await zipOf(store);
		const target = open('b').store;
		await target.create('project', { id: 'mine', name: 'Local' });
		await expect(importBackup(target, zip)).rejects.toMatchObject({ reason: 'notEmpty' });
		expect(await target.get('project', 'mine')).toBeDefined();

		await importBackup(target, zip, { replace: true });
		expect(await target.get('project', 'mine')).toBeUndefined();
		expect(await snapshot(target)).toEqual(await snapshot(store));
	});

	it('checks the whole archive before it touches the store', async () => {
		const { store } = await filled();
		const data = new Uint8Array(await (await zipOf(store)).arrayBuffer());
		const entries = await readZip(new Blob([data]));
		const photo = entries.find((e) => e.name === 'blobs/ph1')!;
		data[photo.offset + 500] ^= 0xff;
		const target = open('b').store;
		await target.create('project', { id: 'mine', name: 'Local' });
		await expect(importBackup(target, new Blob([data]), { replace: true })).rejects.toMatchObject({ reason: 'corrupt' });
		expect(await target.get('project', 'mine')).toBeDefined();
	});

	it('refuses a file that is not a backup', async () => {
		const target = open('b').store;
		await expect(importBackup(target, new Blob(['nope']))).rejects.toMatchObject({ reason: 'notBackup' });
		const other = await new Response(makeZip([{ name: 'hello.txt', input: 'hi' }])).blob();
		await expect(importBackup(target, other)).rejects.toMatchObject({ reason: 'notBackup' });
		await expect(importBackup(target, other)).rejects.toBeInstanceOf(BackupError);
	});

	it('refuses a backup from a newer schema', async () => {
		const { store } = await filled();
		const zip = await saveBackup(exportBackup({ ...store, schemaVersion: SCHEMA_VERSION + 1 }, { now: 0 }), memorySink());
		await expect(importBackup(open('b').store, zip)).rejects.toMatchObject({ reason: 'newerSchema' });
	});

	it('refuses a backup with a file missing', async () => {
		const { store } = await filled();
		const source = { ...store, blobIds: async () => ['ph1'] };
		const honest = JSON.parse(await (await entryBlob(await zipOf(store), (await readZip(await zipOf(store))).at(-1)!)).text());
		// A manifest that promises two files over an archive that holds one.
		const stream = makeZip(
			(async function* () {
				for (const name of source.tableNames()) yield { name: tablePath(name), input: (await source.rows(name)).map((r) => JSON.stringify(r) + '\n').join('') };
				yield { name: 'blobs/ph1', input: (await store.blob('ph1'))! };
				yield { name: MANIFEST_PATH, input: JSON.stringify(honest) };
			})()
		);
		const zip = await new Response(stream).blob();
		await expect(importBackup(open('b').store, zip)).rejects.toMatchObject({ reason: 'incomplete' });
	});

	it('round-trips an empty store', async () => {
		const { store } = open();
		const target = open('b').store;
		await importBackup(target, await zipOf(store));
		expect(await target.isEmpty()).toBe(true);
	});
});
