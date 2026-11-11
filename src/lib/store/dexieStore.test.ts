import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { invertPatch } from '$lib/model/patch';
import type { Take } from '$lib/model/types';
import { applyServerRead } from '$lib/outbox/conflict';
import { fakeTransport } from '$lib/outbox/fakeTransport';
import { markApplied, markAttention, markInFlight, markSent } from '$lib/outbox/machine';
import { createRunner } from '$lib/outbox/runner';
import type { CreateOp, Entry, UpdateOp } from '$lib/outbox/types';
import { openStore, type StoreOptions } from './dexieStore';
import { VERSIONS } from './schema';
import type { StoreEvent } from './types';

let n = 0;

function setup(options: Partial<StoreOptions> = {}) {
	const clock = { t: 1000 };
	const idb = options.indexedDB ?? new IDBFactory();
	const store = openStore({
		name: 'test',
		indexedDB: idb,
		IDBKeyRange,
		now: () => clock.t,
		uuid: () => `u${++n}`,
		...options
	});
	return { clock, idb, store };
}

type S = ReturnType<typeof setup>;

/** A project down to a take. */
async function shoot({ store }: S) {
	await store.create('project', { id: 'p1', name: 'Show' });
	await store.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
	await store.create('camera', { id: 'c1', projectId: 'p1', cameraModel: 'Alexa 35' });
	await store.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '12A' });
	await store.create('take', { id: 't1', slateId: 's1', cameraId: 'c1', take: '1', tStop: 2.8 });
}

/** Marks what is queued as taken by the server, as a drain would. */
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

const photo = (text = 'jpeg-bytes') => new Blob([text], { type: 'image/jpeg' });
const kinds = (q: Entry[]) => q.map((e) => `${e.op.kind} ${e.op.recordId}`);

describe('records', () => {
	it('reads back what was created', async () => {
		const s = setup();
		await shoot(s);
		expect(await s.store.get('take', 't1')).toEqual({ id: 't1', slateId: 's1', cameraId: 'c1', take: '1', tStop: 2.8 });
		expect(await s.store.get('take', 'nope')).toBeUndefined();
	});

	it('lists a table, or the children of one parent', async () => {
		const s = setup();
		await shoot(s);
		await s.store.create('slate', { id: 's2', shootDayId: 'd1', slateUID: '13' });
		await s.store.create('take', { id: 't2', slateId: 's2', take: '1' });
		expect((await s.store.list('take')).map((t) => t.id).sort()).toEqual(['t1', 't2']);
		expect((await s.store.list('take', 's2')).map((t) => t.id)).toEqual(['t2']);
		expect(await s.store.list('take', 'none')).toEqual([]);
		expect((await s.store.list('project')).map((p) => p.id)).toEqual(['p1']);
	});

	it('refuses a second record with the same id', async () => {
		const s = setup();
		await s.store.create('project', { id: 'p1', name: 'A' });
		await expect(s.store.create('project', { id: 'p1', name: 'B' })).rejects.toThrow();
		expect((await s.store.get('project', 'p1'))!.name).toBe('A');
		expect(await s.store.outbox.entries()).toHaveLength(1);
	});
});

describe('create', () => {
	it('queues the create with the records it links to', async () => {
		const s = setup();
		await shoot(s);
		const q = await s.store.outbox.entries();
		expect(kinds(q)).toEqual(['create p1', 'create d1', 'create c1', 'create s1', 'create t1']);
		expect(q[4]).toMatchObject({
			op: { kind: 'create', table: 'take', recordId: 't1', fields: { slateId: 's1', cameraId: 'c1', take: '1', tStop: 2.8 } },
			dependsOn: ['s1', 'c1'],
			state: 'pending',
			createdAt: 1000
		});
		expect((q[4].op as CreateOp).fields).not.toHaveProperty('id');
		expect(q.map((e) => e.seq)).toEqual([...q.map((e) => e.seq)].sort((a, b) => a - b));
	});

	it('writes the record and its outbox entry together or not at all', async () => {
		let fail = false;
		const s = setup({
			uuid: () => {
				if (fail) throw new Error('no id');
				return `u${++n}`;
			}
		});
		await s.store.create('project', { id: 'p1', name: 'A' });
		fail = true;
		await expect(s.store.create('project', { id: 'p2', name: 'B' })).rejects.toThrow('no id');
		await expect(s.store.apply('project', [{ id: 'p1', key: 'name', from: 'A', to: 'C' }])).rejects.toThrow('no id');
		expect((await s.store.get('project', 'p1'))!.name).toBe('A');
		expect(await s.store.get('project', 'p2')).toBeUndefined();
		expect(kinds(await s.store.outbox.entries())).toEqual(['create p1']);
	});

	it('with a file stores the bytes and queues the upload behind the record', async () => {
		const s = setup();
		await shoot(s);
		await s.store.create('still', { id: 'ph1', takeId: 't1', capturedAt: '2026-11-11T10:00:00Z' }, { blob: photo(), id: 'ph1', name: 'a.jpg' });
		expect(await (await s.store.blob('ph1'))!.text()).toBe('jpeg-bytes');
		expect((await s.store.blob('ph1'))!.type).toBe('image/jpeg');
		expect(await s.store.blobsOf('ph1')).toEqual([
			{ id: 'ph1', table: 'still', recordId: 'ph1', name: 'a.jpg', type: 'image/jpeg', size: 10, createdAt: 1000 }
		]);
		const q = await s.store.outbox.entries();
		expect(q.at(-1)).toMatchObject({
			op: { kind: 'blob', table: 'still', recordId: 'ph1', blobId: 'ph1', size: 10, type: 'image/jpeg' },
			dependsOn: ['ph1']
		});
		expect(q.at(-2)).toMatchObject({ op: { kind: 'create', recordId: 'ph1' }, dependsOn: ['t1'] });
	});
});

describe('apply', () => {
	it('changes the records through the model patch and returns it as applied', async () => {
		const s = setup();
		await shoot(s);
		const applied = await s.store.apply('take', [
			{ id: 't1', key: 'tStop', from: 99, to: 4 },
			{ id: 't1', key: 'notes', from: undefined, to: 'wide' },
			{ id: 'ghost', key: 'tStop', from: 1, to: 2 }
		]);
		expect(applied).toEqual([
			{ id: 't1', key: 'tStop', from: 2.8, to: 4 },
			{ id: 't1', key: 'notes', from: undefined, to: 'wide' }
		]);
		expect(await s.store.get('take', 't1')).toMatchObject({ tStop: 4, notes: 'wide' });
	});

	it('clears a field set to undefined', async () => {
		const s = setup();
		await shoot(s);
		await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 2.8, to: undefined }]);
		expect(await s.store.get('take', 't1')).not.toHaveProperty('tStop');
	});

	it('an edit of a record not yet sent rides in its create', async () => {
		const s = setup();
		await shoot(s);
		await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }]);
		const q = await s.store.outbox.entries();
		expect(q).toHaveLength(5);
		expect((q[4].op as CreateOp).fields.tStop).toBe(4);
	});

	it('an edit of a record the server has is queued with base and value', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		s.clock.t = 2000;
		await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }]);
		await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 4, to: 5.6 }]);
		const q = await s.store.outbox.entries();
		expect(q).toHaveLength(1);
		expect(q[0]).toMatchObject({
			op: { kind: 'update', table: 'take', recordId: 't1', changes: { tStop: { base: 2.8, value: 5.6 } } },
			state: 'pending',
			createdAt: 2000
		});
	});

	it('a bulk edit queues one entry per record, in one transaction', async () => {
		const s = setup();
		await shoot(s);
		await s.store.create('take', { id: 't2', slateId: 's1', take: '2', tStop: 2.8 });
		await confirmAll(s);
		const events: StoreEvent[] = [];
		s.store.subscribe((e) => events.push(e));
		await s.store.apply('take', [
			{ id: 't1', key: 'tStop', from: 2.8, to: 4 },
			{ id: 't2', key: 'tStop', from: 2.8, to: 4 }
		]);
		expect(kinds(await s.store.outbox.entries())).toEqual(['update t1', 'update t2']);
		expect(events).toEqual([{ tables: ['take', 'outbox'] }]);
	});

	it('an edit that links to another record waits for it', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		await s.store.create('lens', { id: 'l1', projectId: 'p1', lensModel: '32mm' });
		await s.store.apply('take', [{ id: 't1', key: 'lensId', from: undefined, to: 'l1' }]);
		const q = await s.store.outbox.entries();
		expect(q[1]).toMatchObject({ op: { kind: 'update', recordId: 't1' }, dependsOn: ['l1'] });
	});

	it('stores text typed another way, and queues nothing for it', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		const six = { m: 1.8288, entered: { text: "6'", system: 'imperial' as const } };
		await s.store.apply('take', [{ id: 't1', key: 'lensHeight', from: undefined, to: six }]);
		await confirmAll(s);
		const again = { m: 1.8288, entered: { text: '6 ft', system: 'imperial' as const } };
		await s.store.apply('take', [{ id: 't1', key: 'lensHeight', from: six, to: again }]);
		expect(((await s.store.get('take', 't1')) as Take).lensHeight).toEqual(again);
		expect(await s.store.outbox.entries()).toEqual([]);
	});
});

describe('undo', () => {
	it('of an edit not yet sent leaves nothing to send', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		const applied = await s.store.apply('take', [
			{ id: 't1', key: 'tStop', from: 2.8, to: 4 },
			{ id: 't1', key: 'notes', from: undefined, to: 'x' }
		]);
		expect(await s.store.outbox.entries()).toHaveLength(1);
		await s.store.apply('take', invertPatch(applied));
		expect(await s.store.outbox.entries()).toEqual([]);
		expect(await s.store.get('take', 't1')).toEqual({ id: 't1', slateId: 's1', cameraId: 'c1', take: '1', tStop: 2.8 });
		expect((await s.store.unsynced()).entries).toBe(0);
	});

	it('of an edit already sent queues the inverse', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		const applied = await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }]);
		await confirmAll(s);
		await s.store.apply('take', invertPatch(applied));
		const q = await s.store.outbox.entries();
		expect(q).toHaveLength(1);
		expect((q[0].op as UpdateOp).changes).toEqual({ tStop: { base: 4, value: 2.8 } });
		expect((await s.store.get('take', 't1'))!.tStop).toBe(2.8);
	});

	it('of an edit in flight queues the inverse behind it', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		const applied = await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }]);
		await s.store.outbox.update((q) => markInFlight(q, [q[0].id]));
		await s.store.apply('take', invertPatch(applied));
		const q = await s.store.outbox.entries();
		expect(q.map((e) => e.state)).toEqual(['inFlight', 'pending']);
		expect((q[0].op as UpdateOp).changes).toEqual({ tStop: { base: 2.8, value: 4 } });
		expect((q[1].op as UpdateOp).changes).toEqual({ tStop: { base: 4, value: 2.8 } });
	});
});

describe('remove and restore', () => {
	it('a record never sent leaves the lists and the queue', async () => {
		const s = setup();
		await shoot(s);
		await s.store.remove('take', 't1');
		expect(await s.store.get('take', 't1')).toBeUndefined();
		expect(await s.store.list('take', 's1')).toEqual([]);
		expect(kinds(await s.store.outbox.entries())).not.toContain('create t1');
	});

	it('restore brings it back as it was, queued again with its file', async () => {
		const s = setup();
		await shoot(s);
		await s.store.create('still', { id: 'ph1', takeId: 't1', capturedAt: 'x' }, { blob: photo(), id: 'ph1' });
		await s.store.remove('still', 'ph1');
		expect(kinds(await s.store.outbox.entries())).not.toContain('blob ph1');
		expect(await s.store.restore('still', 'ph1')).toBe(true);
		expect(await s.store.get('still', 'ph1')).toEqual({ id: 'ph1', takeId: 't1', capturedAt: 'x' });
		expect(kinds(await s.store.outbox.entries()).slice(-2)).toEqual(['create ph1', 'blob ph1']);
		expect(await (await s.store.blob('ph1'))!.text()).toBe('jpeg-bytes');
	});

	it('a record the server has gets a delete queued; restore before it is sent cancels it', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		await s.store.remove('take', 't1');
		expect(kinds(await s.store.outbox.entries())).toEqual(['delete t1']);
		expect(await s.store.restore('take', 't1')).toBe(true);
		expect(await s.store.outbox.entries()).toEqual([]);
		expect((await s.store.get('take', 't1'))!.take).toBe('1');
		expect(await s.store.remoteId('t1')).toBeDefined();
	});

	it('once the server confirms the delete, the record, its files and its server id are gone', async () => {
		const s = setup();
		await shoot(s);
		await s.store.create('still', { id: 'ph1', takeId: 't1', capturedAt: 'x' }, { blob: photo(), id: 'ph1' });
		await confirmAll(s);
		await s.store.remove('still', 'ph1');
		expect(await s.store.blob('ph1')).toBeDefined();
		await confirmAll(s);
		expect(await s.store.blob('ph1')).toBeUndefined();
		expect(await s.store.blobsOf('ph1')).toEqual([]);
		expect(await s.store.remoteId('ph1')).toBeUndefined();
		expect(await s.store.restore('still', 'ph1')).toBe(false);
	});

	it('restore is refused while the delete is on its way', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		await s.store.remove('take', 't1');
		await s.store.outbox.update((q) => markInFlight(q, [q[0].id]));
		expect(await s.store.restore('take', 't1')).toBe(false);
		expect(await s.store.get('take', 't1')).toBeUndefined();
	});

	it('removing what is not there does nothing', async () => {
		const s = setup();
		await s.store.remove('take', 'nope');
		expect(await s.store.restore('take', 'nope')).toBe(false);
		expect(await s.store.outbox.entries()).toEqual([]);
	});

	it('purgeTrash drops old removals that never reached the server, with their files', async () => {
		const s = setup();
		await shoot(s);
		await s.store.create('still', { id: 'ph1', takeId: 't1', capturedAt: 'x' }, { blob: photo(), id: 'ph1' });
		await s.store.create('still', { id: 'ph2', takeId: 't1', capturedAt: 'x' }, { blob: photo(), id: 'ph2' });
		await s.store.remove('still', 'ph1');
		s.clock.t = 5000;
		await s.store.remove('still', 'ph2');
		expect(await s.store.purgeTrash(5000)).toBe(1);
		expect(await s.store.blob('ph1')).toBeUndefined();
		expect(await s.store.restore('still', 'ph1')).toBe(false);
		expect(await s.store.restore('still', 'ph2')).toBe(true);
	});

	it('purgeTrash keeps a removal whose delete is still queued', async () => {
		const s = setup();
		await shoot(s);
		await confirmAll(s);
		await s.store.remove('take', 't1');
		expect(await s.store.purgeTrash(1e12)).toBe(0);
		expect(await s.store.restore('take', 't1')).toBe(true);
	});
});

describe('a table kept on the device', () => {
	const template = { id: 'tp1', projectId: 'p1', name: 'Day ext', scope: 'take' as const, values: { tStop: 2.8 } };

	it('stores, edits, removes and restores a template, and queues nothing for it', async () => {
		const s = setup();
		await s.store.create('project', { id: 'p1', name: 'Show' });
		const before = await s.store.outbox.entries();
		const events: StoreEvent[] = [];
		s.store.subscribe((e) => events.push(e));

		await s.store.create('template', template);
		expect(await s.store.list('template', 'p1')).toEqual([template]);
		const applied = await s.store.apply('template', [{ id: 'tp1', key: 'values', from: template.values, to: { tStop: 4 } }]);
		expect(applied).toEqual([{ id: 'tp1', key: 'values', from: { tStop: 2.8 }, to: { tStop: 4 } }]);
		await s.store.apply('template', invertPatch(applied));
		expect((await s.store.get('template', 'tp1'))!.values).toEqual({ tStop: 2.8 });
		await s.store.remove('template', 'tp1');
		expect(await s.store.get('template', 'tp1')).toBeUndefined();
		expect(await s.store.restore('template', 'tp1')).toBe(true);
		expect(await s.store.get('template', 'tp1')).toEqual(template);

		expect(await s.store.outbox.entries()).toEqual(before);
		expect(events.flatMap((e) => e.tables)).not.toContain('outbox');
		expect(events.every((e) => e.tables.includes('template'))).toBe(true);
	});
});

describe('files', () => {
	async function withPhoto(s: S) {
		await shoot(s);
		await s.store.create('still', { id: 'ph1', takeId: 't1', capturedAt: 'x' });
		return s.store.putBlob('still', 'ph1', { blob: photo() });
	}

	it('putBlob gives the file an id, stores it and queues the upload', async () => {
		const s = setup();
		const meta = await withPhoto(s);
		expect(meta).toMatchObject({ table: 'still', recordId: 'ph1', size: 10, type: 'image/jpeg' });
		expect(await (await s.store.blob(meta.id))!.text()).toBe('jpeg-bytes');
		expect((await s.store.outbox.entries()).at(-1)!.op).toMatchObject({ kind: 'blob', blobId: meta.id });
		expect(await s.store.blob('nope')).toBeUndefined();
	});

	it('a verified upload is marked, with the server id of the file', async () => {
		const s = setup();
		const meta = await withPhoto(s);
		await confirmAll(s, (e) => e.op.kind !== 'blob');
		s.clock.t = 9000;
		await s.store.outbox.update((q) => markApplied(markInFlight(q, [q[0].id]), [{ id: q[0].id, remoteId: 'file-7' }]));
		expect((await s.store.blobsOf('ph1'))[0]).toMatchObject({ id: meta.id, verifiedAt: 9000, remoteId: 'file-7' });
	});

	it('pruneBlobs frees only verified files past the keep time, and keeps their description', async () => {
		const s = setup();
		const meta = await withPhoto(s);
		const other = await s.store.putBlob('still', 'ph1', { blob: photo('other') });
		await s.store.outbox.update((q) => {
			const ids = q.filter((e) => e.op.kind !== 'blob' || e.op.blobId === meta.id).map((e) => e.id);
			return markApplied(markInFlight(q, ids), ids.map((id) => ({ id, remoteId: 1 })));
		});
		expect(await s.store.pruneBlobs()).toBe(0);
		s.clock.t += 7 * 24 * 3600_000;
		expect(await s.store.pruneBlobs()).toBe(1);
		expect(await s.store.blob(meta.id)).toBeUndefined();
		expect(await (await s.store.blob(other.id))!.text()).toBe('other');
		const metas = await s.store.blobsOf('ph1');
		expect(metas.find((m) => m.id === meta.id)).toMatchObject({ prunedAt: s.clock.t, size: 10 });
		expect(metas.find((m) => m.id === other.id)).not.toHaveProperty('prunedAt');
		expect(await s.store.pruneBlobs()).toBe(0);
	});
});

describe('outbox port', () => {
	it('keeps the server id of a created record', async () => {
		const s = setup();
		await s.store.create('project', { id: 'p1', name: 'A' });
		await s.store.outbox.update((q) => markApplied(markInFlight(q, [q[0].id]), [{ id: q[0].id, remoteId: 42 }]));
		expect(await s.store.outbox.remoteIds(['p1', 'p2'])).toEqual({ p1: 42 });
		expect(await s.store.remoteId('p1')).toBe(42);
		expect(await s.store.outbox.entries()).toEqual([]);
	});

	it('writes only what changed and returns the queue as written', async () => {
		const s = setup();
		await shoot(s);
		const before = await s.store.outbox.entries();
		const after = await s.store.outbox.update((q) => markInFlight(q, [q[1].id]));
		expect(after.map((e) => e.state)).toEqual(['pending', 'inFlight', 'pending', 'pending', 'pending']);
		expect(await s.store.outbox.entries()).toEqual(after);
		expect(after[0]).toEqual(before[0]);
	});

	it('counts what is unsynced', async () => {
		const s = setup();
		await shoot(s);
		expect(await s.store.unsynced()).toEqual({ entries: 5, records: 5, blobs: 0, attention: 0, oldest: 1000 });
	});
});

describe('attention', () => {
	async function conflicted(s: S) {
		await shoot(s);
		await confirmAll(s);
		await s.store.apply('take', [
			{ id: 't1', key: 'tStop', from: 2.8, to: 4 },
			{ id: 't1', key: 'iso', from: undefined, to: 800 }
		]);
		const [entry] = await s.store.outbox.update((q) => applyServerRead(q, q[0].id, { tStop: 5.6 }));
		return entry;
	}

	it('taking theirs sets the local value to the server value and queues nothing for it', async () => {
		const s = setup();
		const entry = await conflicted(s);
		await s.store.resolve(entry.id, () => 'theirs');
		expect((await s.store.get('take', 't1'))!.tStop).toBe(5.6);
		const q = await s.store.outbox.entries();
		expect(q).toHaveLength(1);
		expect(q[0]).toMatchObject({ state: 'pending', op: { changes: { iso: { value: 800 } } } });
		expect((q[0].op as UpdateOp).changes).not.toHaveProperty('tStop');
	});

	it('taking theirs does not overwrite a value typed since the conflict', async () => {
		const s = setup();
		const entry = await conflicted(s);
		await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 4, to: 8 }]);
		await s.store.resolve(entry.id, () => 'theirs');
		expect((await s.store.get('take', 't1'))!.tStop).toBe(8);
	});

	it('keeping ours queues the entry again and leaves the record alone', async () => {
		const s = setup();
		const entry = await conflicted(s);
		await s.store.resolve(entry.id, () => 'mine');
		expect((await s.store.get('take', 't1'))!.tStop).toBe(4);
		expect((await s.store.outbox.entries())[0]).toMatchObject({
			state: 'pending',
			op: { changes: { tStop: { base: 5.6, value: 4 } } }
		});
	});

	it('retry sends a refused entry again', async () => {
		const s = setup();
		await s.store.create('project', { id: 'p1', name: 'A' });
		const [entry] = await s.store.outbox.update((q) => markAttention(q, q[0].id, { reason: 'refused' }));
		expect((await s.store.unsynced()).attention).toBe(1);
		await s.store.retry(entry.id);
		expect((await s.store.outbox.entries())[0].state).toBe('pending');
	});
});

describe('subscribe', () => {
	it('tells what changed after each write, and stops when unsubscribed', async () => {
		const s = setup();
		const events: StoreEvent[] = [];
		const off = s.store.subscribe((e) => events.push(e));
		await s.store.create('project', { id: 'p1', name: 'A' });
		await s.store.putBlob('project', 'p1', { blob: photo() });
		await s.store.remove('project', 'p1');
		expect(events).toEqual([
			{ tables: ['project', 'outbox'] },
			{ tables: ['blobs', 'outbox'] },
			{ tables: ['project', 'trash', 'outbox'] }
		]);
		off();
		await s.store.create('project', { id: 'p2', name: 'B' });
		expect(events).toHaveLength(3);
	});

	it('says nothing when a write fails', async () => {
		const s = setup();
		await s.store.create('project', { id: 'p1', name: 'A' });
		const events: StoreEvent[] = [];
		s.store.subscribe((e) => events.push(e));
		await expect(s.store.create('project', { id: 'p1', name: 'B' })).rejects.toThrow();
		expect(events).toEqual([]);
	});

	it('tells of queue changes made by the runner', async () => {
		const s = setup();
		await s.store.create('project', { id: 'p1', name: 'A' });
		const events: StoreEvent[] = [];
		s.store.subscribe((e) => events.push(e));
		await s.store.outbox.update((q) => markInFlight(q, [q[0].id]));
		await s.store.outbox.update((q) => q);
		expect(events).toEqual([{ tables: ['outbox'] }]);
	});

	it('one listener that throws does not stop the others', async () => {
		const s = setup();
		const events: StoreEvent[] = [];
		s.store.subscribe(() => {
			throw new Error('bad listener');
		});
		s.store.subscribe((e) => events.push(e));
		await s.store.create('project', { id: 'p1', name: 'A' });
		expect(events).toHaveLength(1);
	});
});

describe('storage', () => {
	it('asks for persistence through the helper passed in and reports the answer and the estimate', async () => {
		let asked = 0;
		const s = setup({
			requestPersist: async () => (asked++, true),
			persisted: async () => asked > 0,
			estimate: async () => ({ usage: 100, quota: 400 })
		});
		expect(await s.store.storage()).toEqual({ persisted: false, usage: 100, quota: 400, free: 300, usedFraction: 0.25 });
		expect(await s.store.persist()).toBe(true);
		expect(asked).toBe(1);
		expect((await s.store.storage()).persisted).toBe(true);
	});

	it('reports not persisted where the browser has no storage manager', async () => {
		const s = setup();
		expect(await s.store.persist()).toBe(false);
		expect(await s.store.storage()).toEqual({ persisted: false });
	});
});

describe('the database', () => {
	it('keeps everything across a close and a reopen, and the queue order carries on', async () => {
		const s = setup();
		await shoot(s);
		await s.store.create('still', { id: 'ph1', takeId: 't1', capturedAt: 'x' }, { blob: photo(), id: 'ph1' });
		s.store.close();

		const again = setup({ indexedDB: s.idb });
		expect((await again.store.get('take', 't1'))!.take).toBe('1');
		expect(await (await again.store.blob('ph1'))!.text()).toBe('jpeg-bytes');
		const before = await again.store.outbox.entries();
		expect(before).toHaveLength(7);
		await again.store.create('project', { id: 'p9', name: 'Z' });
		const after = await again.store.outbox.entries();
		expect(after.at(-1)!.seq).toBeGreaterThan(before.at(-1)!.seq);
	});

	it('migrates: a later schema version upgrades the rows already there', async () => {
		const s = setup();
		await shoot(s);
		s.store.close();

		const v2 = {
			version: VERSIONS.length + 1,
			stores: { take: 'id, slateId, cameraId' },
			upgrade: async (tx: { table(name: string): { toCollection(): { modify(fn: (row: Take) => void): Promise<unknown> } } }) => {
				await tx.table('take').toCollection().modify((row) => {
					row.notes = 'migrated';
				});
			}
		};
		const again = setup({ indexedDB: s.idb, versions: [...VERSIONS, v2] });
		expect(await again.store.get('take', 't1')).toMatchObject({ take: '1', notes: 'migrated' });
		expect(again.store.schemaVersion).toBe(VERSIONS.length + 1);
		expect(await again.store.outbox.entries()).toHaveLength(5);
	});
});

describe('with the runner and a transport', () => {
	function sync(s: S) {
		const transport = fakeTransport(s.clock);
		const runner = createRunner({
			port: s.store.outbox,
			transport,
			env: { now: () => s.clock.t, visible: () => true, online: () => true, random: () => 1 }
		});
		const settle = async () => {
			for (let i = 0; i < 20; i++) {
				const report = await runner.drain();
				if (report.stopped !== 'waiting') return report;
				s.clock.t = report.waitUntil!;
			}
			throw new Error('never settled');
		};
		return { transport, settle };
	}

	it('a day of capture reaches the server level by level, and the file is verified before it is marked', async () => {
		const s = setup();
		const { transport, settle } = sync(s);
		await shoot(s);
		await s.store.create('still', { id: 'ph1', takeId: 't1', capturedAt: 'x' }, { blob: photo(), id: 'ph1' });
		const report = await settle();
		expect(report.unsynced.entries).toBe(0);
		expect(transport.violations).toEqual([]);
		expect(transport.rows.get('t1')!.fields).toEqual({ slateId: 's1', cameraId: 'c1', take: '1', tStop: 2.8 });
		expect(await s.store.remoteId('t1')).toBe(transport.rows.get('t1')!.remoteId);
		expect(transport.files.get('ph1')!.size).toBe(10);
		expect((await s.store.blobsOf('ph1'))[0].verifiedAt).toBe(s.clock.t);
		expect(await s.store.blob('ph1')).toBeDefined();
	});

	it('undo of an unsent edit sends nothing; undo of a sent edit sends the inverse', async () => {
		const s = setup();
		const { transport, settle } = sync(s);
		await shoot(s);
		await settle();
		const pushes = transport.count('push');

		const unsent = await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }]);
		await s.store.apply('take', invertPatch(unsent));
		await settle();
		expect(transport.count('push')).toBe(pushes);

		const sent = await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }]);
		await settle();
		expect(transport.rows.get('t1')!.fields.tStop).toBe(4);
		await s.store.apply('take', invertPatch(sent));
		await settle();
		expect(transport.rows.get('t1')!.fields.tStop).toBe(2.8);
		expect(transport.count('push')).toBe(pushes + 2);
	});

	it('a conflict leaves the local value in place until someone picks', async () => {
		const s = setup();
		const { transport, settle } = sync(s);
		await shoot(s);
		await settle();
		await s.store.apply('take', [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }]);
		transport.serverEdit('t1', { tStop: 5.6 });
		const report = await settle();
		expect(report.unsynced.attention).toBe(1);
		expect((await s.store.get('take', 't1'))!.tStop).toBe(4);
		expect(transport.rows.get('t1')!.fields.tStop).toBe(5.6);
		const [entry] = await s.store.outbox.entries();
		await s.store.resolve(entry.id, () => 'mine');
		await settle();
		expect(transport.rows.get('t1')!.fields.tStop).toBe(4);
	});

	it('a crash after the request left: the reopened store checks, and creates nothing twice', async () => {
		const s = setup();
		const { transport } = sync(s);
		await shoot(s);
		// The first batch landed; the app died before the answer was written.
		await s.store.outbox.update((q) => markInFlight(q, [q[0].id]));
		transport.seed('project', 'p1', { name: 'Show' });
		s.store.close();

		const again = setup({ indexedDB: s.idb });
		again.clock.t = s.clock.t;
		const second = sync(again);
		second.transport.rows = transport.rows;
		await second.settle();
		expect(second.transport.batches.flat().some((o) => o.op.recordId === 'p1')).toBe(false);
		expect(await again.store.remoteId('p1')).toBe(transport.rows.get('p1')!.remoteId);
		expect((await again.store.unsynced()).entries).toBe(0);
	});

	it('an upload sent but unverified keeps its bytes', async () => {
		const s = setup();
		await shoot(s);
		await s.store.create('still', { id: 'ph1', takeId: 't1', capturedAt: 'x' }, { blob: photo(), id: 'ph1' });
		await s.store.outbox.update((q) => {
			const b = q.find((e) => e.op.kind === 'blob')!;
			return markSent(markInFlight(q, [b.id]), b.id, 0, 'file-1');
		});
		s.clock.t += 365 * 24 * 3600_000;
		expect(await s.store.pruneBlobs(0)).toBe(0);
		expect(await s.store.blob('ph1')).toBeDefined();
	});
});
