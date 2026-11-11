// The Store on IndexedDB, through Dexie. This is the edge: transactions and tables. The rules are
// in the pure modules: the model's patches, the outbox reducer, `tables.ts`, `storage.ts`.
//
// Every write is one transaction over the record table and the outbox, so a saved value always
// has its queue entry and a queue entry always has its value.

import Dexie, { type Table } from 'dexie';
import { applyPatch, type Change, type Patch } from '$lib/model/patch';
import { sameValue } from '$lib/model/value';
import { resolveConflict } from '$lib/outbox/conflict';
import { retry } from '$lib/outbox/machine';
import { settle, type OutboxPort } from '$lib/outbox/port';
import { enqueue } from '$lib/outbox/queue';
import { unsynced } from '$lib/outbox/select';
import { isActive, isOpen, type Entry, type FieldEdit, type Fresh, type Op, type Queue, type RemoteId } from '$lib/outbox/types';
import { persistStorage } from '$lib/pwa/persist';
import { INTERNAL_TABLES, VERSIONS, type SchemaVersion } from './schema';
import { BLOB_KEEP_MS, prunable, storageStatus } from './storage';
import { dependsOn, isTable, PARENTS, TABLES, type TableName } from './tables';
import type { BackupSource, BackupTarget, BlobMeta, NewBlob, Store, StoreEvent } from './types';

export type StoreOptions = {
	/** Database name. */
	name?: string;
	/** For tests and for hosts with no global IndexedDB. */
	indexedDB?: IDBFactory;
	IDBKeyRange?: typeof IDBKeyRange;
	now?: () => number;
	uuid?: () => string;
	/** The schema versions. Tests pass a longer list to prove a migration. */
	versions?: readonly SchemaVersion[];
	/** Asks the browser to keep storage. Default: the pwa helper. */
	requestPersist?: () => Promise<boolean>;
	persisted?: () => Promise<boolean>;
	estimate?: () => Promise<{ usage?: number; quota?: number } | undefined>;
};

export type DexieStore = Store & BackupSource & BackupTarget;

type Row = { id: string } & Record<string, unknown>;
type TrashRow = { id: string; table: TableName; record: Row; deletedAt: number };
type QueueOp = { op: Op; dependsOn: readonly string[] };

const QUEUE_TABLES = ['outbox', 'remotes', 'blobs', 'blobData', 'trash', 'meta'] as const;
/** Everything a backup holds as rows. The bytes of `blobData` travel as files. */
const BACKUP_TABLES = [...TABLES, 'blobs', 'outbox', 'remotes', 'trash', 'meta'];

function browserStorage(): StorageManager | undefined {
	return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

export function openStore(options: StoreOptions = {}): DexieStore {
	const now = options.now ?? (() => Date.now());
	const uuid = options.uuid ?? (() => crypto.randomUUID());
	const versions = options.versions ?? VERSIONS;
	const db = new Dexie(options.name ?? 'sg-onset', {
		...(options.indexedDB ? { indexedDB: options.indexedDB } : {}),
		...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {})
	});
	for (const v of versions) {
		const version = db.version(v.version).stores(v.stores);
		if (v.upgrade) version.upgrade(v.upgrade);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const table = <T = any>(name: string): Table<T, string> => db.table(name);
	const outbox = table<Entry>('outbox');
	const remotes = table<{ id: string; table: string; remoteId: RemoteId; at: number }>('remotes');
	const blobs = table<BlobMeta>('blobs');
	const blobData = table<{ id: string; data: Blob }>('blobData');
	const trash = table<TrashRow>('trash');
	const meta = table<{ key: string; value: number }>('meta');

	const listeners = new Set<(event: StoreEvent) => void>();
	function emit(tables: string[]): void {
		if (!tables.length) return;
		for (const listener of [...listeners]) {
			try {
				listener({ tables });
			} catch {
				// A listener's trouble is its own.
			}
		}
	}

	/** One transaction over the queue's tables and `extra`. */
	function write<T>(extra: readonly string[], fn: () => Promise<T>): Promise<T> {
		return db.transaction('rw', [...extra, ...QUEUE_TABLES].map((n) => table(n)), fn);
	}

	// What follows runs inside a `write`.

	/** `count` ids and queue positions. The position counter lives in `meta`, so it survives a reopen. */
	async function fresh(count: number): Promise<Fresh[]> {
		const ids = Array.from({ length: count }, () => uuid());
		const last = (await meta.get('seq'))?.value ?? 0;
		await meta.put({ key: 'seq', value: last + count });
		const at = now();
		return ids.map((id, i) => ({ id, seq: last + 1 + i, now: at }));
	}

	async function dropBlobs(recordId: string): Promise<void> {
		const ids = await blobs.where('recordId').equals(recordId).primaryKeys();
		await blobs.bulkDelete(ids);
		await blobData.bulkDelete(ids);
	}

	/**
	 * Runs the pure `fn` over the queue (all of it, or the entries of some records) and writes
	 * what it changed. Confirmed entries are settled: server ids kept, deleted records purged,
	 * files marked verified.
	 */
	async function editQueue(scope: 'all' | readonly string[], fn: (queue: Queue) => Queue): Promise<{ queue: Entry[]; changed: boolean }> {
		const before = scope === 'all' ? await outbox.toArray() : await outbox.where('op.recordId').anyOf([...scope]).toArray();
		before.sort((a, b) => a.seq - b.seq);
		const settled = settle(fn(before));
		const had = new Set(before);
		const puts = settled.queue.filter((e) => !had.has(e));
		const kept = new Set(settled.queue.map((e) => e.id));
		const gone = before.filter((e) => !kept.has(e.id)).map((e) => e.id);
		if (puts.length) await outbox.bulkPut(puts);
		if (gone.length) await outbox.bulkDelete(gone);
		const at = now();
		for (const c of settled.created) await remotes.put({ ...c, at });
		for (const d of settled.deleted) {
			await remotes.delete(d.id);
			await trash.delete(d.id);
			await dropBlobs(d.id);
		}
		for (const v of settled.verified) {
			await blobs.update(v.blobId, { verifiedAt: at, ...(v.remoteId !== undefined ? { remoteId: v.remoteId } : {}) });
		}
		return { queue: settled.queue.sort((a, b) => a.seq - b.seq), changed: puts.length > 0 || gone.length > 0 };
	}

	/** Adds operations to the queue through the reducer. */
	async function queue(ops: readonly QueueOp[]): Promise<boolean> {
		if (!ops.length) return false;
		const stamps = await fresh(ops.length);
		const ids = [...new Set(ops.map((o) => o.op.recordId))];
		const { changed } = await editQueue(ids, (q) => ops.reduce((next, o, i) => enqueue(next, o.op, o.dependsOn, stamps[i]), q));
		return changed;
	}

	async function addBlob(owner: TableName, recordId: string, file: NewBlob): Promise<BlobMeta> {
		const info: BlobMeta = {
			id: file.id ?? uuid(),
			table: owner,
			recordId,
			...(file.name ? { name: file.name } : {}),
			type: file.blob.type,
			size: file.blob.size,
			createdAt: now()
		};
		await blobs.add(info);
		await blobData.add({ id: info.id, data: file.blob });
		await queue([blobOp(info)]);
		return info;
	}

	function blobOp(info: BlobMeta): QueueOp {
		return {
			op: { kind: 'blob', table: info.table, recordId: info.recordId, blobId: info.id, size: info.size, type: info.type },
			dependsOn: [info.recordId]
		};
	}

	const port: OutboxPort = {
		entries: () => outbox.orderBy('seq').toArray(),
		async update(fn) {
			const result = await write([], () => editQueue('all', fn));
			if (result.changed) emit(['outbox']);
			return result.queue;
		},
		async remoteIds(ids) {
			const rows = await remotes.bulkGet([...new Set(ids)]);
			return Object.fromEntries(rows.flatMap((r) => (r ? [[r.id, r.remoteId]] : [])));
		},
		blob: (id) => store.blob(id)
	};

	const store: DexieStore = {
		get: (name, id) => table(name).get(id),

		async list(name, parentId) {
			if (parentId === undefined) return table(name).toArray();
			const parent = PARENTS[name];
			return parent ? table(name).where(parent.key).equals(parentId).toArray() : [];
		},

		async create(name, record, attach) {
			await write([name], async () => {
				await table(name).add(record);
				const { id, ...fields } = record as Row;
				await queue([{ op: { kind: 'create', table: name, recordId: id, fields }, dependsOn: dependsOn(name, fields) }]);
				if (attach) await addBlob(name, id, attach);
			});
			emit([name, ...(attach ? ['blobs'] : []), 'outbox']);
		},

		async apply(name, patch) {
			let queued = false;
			const applied = await write([name], async () => {
				const ids = [...new Set(patch.map((c) => c.id))];
				const rows = (await table<Row>(name).bulkGet(ids)).filter((r): r is Row => r !== undefined);
				// The patch as it really applies: `from` is what is stored, whatever the caller believed.
				const current = new Map(rows.map((r) => [r.id, { ...r }]));
				const real: Change[] = [];
				for (const c of patch) {
					const row = current.get(c.id);
					if (!row || c.key === 'id') continue;
					real.push({ id: c.id, key: c.key, from: row[c.key], to: c.to });
					if (c.to === undefined) delete row[c.key];
					else row[c.key] = c.to;
				}
				if (!real.length) return real;
				await table<Row>(name).bulkPut(applyPatch(rows, real));

				const edits = new Map<string, Record<string, FieldEdit>>();
				for (const c of real) {
					const changes = edits.get(c.id) ?? {};
					changes[c.key] = { base: c.key in changes ? changes[c.key].base : c.from, value: c.to };
					edits.set(c.id, changes);
				}
				queued = await queue(
					[...edits].map(([recordId, changes]) => ({
						op: { kind: 'update', table: name, recordId, changes },
						dependsOn: dependsOn(name, Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.value])))
					}))
				);
				return real;
			});
			if (applied.length) emit([name, ...(queued ? ['outbox'] : [])]);
			return applied;
		},

		async remove(name, id) {
			const removed = await write([name], async () => {
				const record = await table<Row>(name).get(id);
				if (!record) return false;
				await table(name).delete(id);
				await trash.put({ id, table: name, record, deletedAt: now() });
				await queue([{ op: { kind: 'delete', table: name, recordId: id }, dependsOn: [] }]);
				return true;
			});
			if (removed) emit([name, 'trash', 'outbox']);
		},

		async restore(name, id) {
			const restored = await write([name], async () => {
				const item = await trash.get(id);
				if (!item || item.table !== name) return false;
				const mine = (await outbox.where('op.recordId').equals(id).toArray()).filter(isActive);
				const pendingDelete = mine.find((e) => e.op.kind === 'delete');
				// The delete has left, or may have: the server copy cannot be counted on.
				if (pendingDelete && !isOpen(pendingDelete)) return false;
				await table(name).put(item.record);
				await trash.delete(id);
				const { id: _id, ...fields } = item.record;
				const ops: QueueOp[] = [];
				// An unsent delete is cancelled by the create. A record the server never had is created.
				if (pendingDelete || !(await remotes.get(id))) {
					ops.push({ op: { kind: 'create', table: name, recordId: id, fields }, dependsOn: dependsOn(name, fields) });
				}
				const queuedBlobs = new Set(mine.flatMap((e) => (e.op.kind === 'blob' ? [e.op.blobId] : [])));
				for (const info of await blobs.where('recordId').equals(id).toArray()) {
					if (info.verifiedAt === undefined && !queuedBlobs.has(info.id)) ops.push(blobOp(info));
				}
				await queue(ops);
				return true;
			});
			if (restored) emit([name, 'trash', 'outbox']);
			return restored;
		},

		async purgeTrash(before) {
			const purged = await write([], async () => {
				let count = 0;
				for (const item of await trash.toArray()) {
					if (item.deletedAt >= before) continue;
					// A delete still queued needs the row until the server confirms.
					if (await outbox.where('op.recordId').equals(item.id).count()) continue;
					await trash.delete(item.id);
					await dropBlobs(item.id);
					count += 1;
				}
				return count;
			});
			if (purged) emit(['trash', 'blobs']);
			return purged;
		},

		async putBlob(name, recordId, file) {
			const info = await write([], () => addBlob(name, recordId, file));
			emit(['blobs', 'outbox']);
			return info;
		},

		async blob(id) {
			return (await blobData.get(id))?.data;
		},

		blobsOf: (recordId) => blobs.where('recordId').equals(recordId).sortBy('createdAt'),

		async pruneBlobs(keepMs = BLOB_KEEP_MS) {
			const pruned = await write([], async () => {
				const at = now();
				const ids = (await blobs.toArray()).filter((info) => prunable(info, at, keepMs)).map((info) => info.id);
				await blobData.bulkDelete(ids);
				for (const id of ids) await blobs.update(id, { prunedAt: at });
				return ids.length;
			});
			if (pruned) emit(['blobs']);
			return pruned;
		},

		outbox: port,

		unsynced: async () => unsynced(await port.entries()),

		async resolve(entryId, pick) {
			const entry = await outbox.get(entryId);
			if (!entry || !isTable(entry.op.table)) return;
			const name = entry.op.table;
			let touched = false;
			await write([name], async () => {
				let local: Patch = [];
				await editQueue([entry.op.recordId], (q) => {
					const resolved = resolveConflict(q, entryId, pick);
					local = resolved.local;
					return resolved.queue;
				});
				const row = await table<Row>(name).get(entry.op.recordId);
				if (!row) return;
				// A value typed since the conflict was shown is newer than the choice: it stays.
				const mine = local.filter((c) => sameValue(row[c.key], c.from));
				if (!mine.length) return;
				await table<Row>(name).bulkPut(applyPatch([row], mine));
				touched = true;
			});
			emit([...(touched ? [name] : []), 'outbox']);
		},

		async retry(entryId) {
			await port.update((q) => retry(q, entryId));
		},

		async remoteId(id) {
			return (await remotes.get(id))?.remoteId;
		},

		subscribe(listener) {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},

		persist: () => (options.requestPersist ?? persistStorage)(),

		async storage() {
			const manager = browserStorage();
			const persisted = options.persisted ?? (async () => (await manager?.persisted?.()) ?? false);
			const estimate = options.estimate ?? (async () => manager?.estimate?.());
			const safe = async <T>(ask: () => Promise<T>, fallback: T): Promise<T> => {
				try {
					return await ask();
				} catch {
					return fallback;
				}
			};
			return storageStatus(await safe(persisted, false), await safe(estimate, undefined));
		},

		close: () => db.close(),

		// Backup.
		schemaVersion: versions[versions.length - 1].version,
		tableNames: () => [...BACKUP_TABLES],
		rows: (name) => table(name).toArray(),
		blobIds: () => blobData.toCollection().primaryKeys(),

		async isEmpty() {
			for (const name of [...TABLES, ...INTERNAL_TABLES]) {
				if (name !== 'meta' && (await table(name).count())) return false;
			}
			return true;
		},

		async clear() {
			const names = [...TABLES, ...INTERNAL_TABLES];
			await db.transaction('rw', names.map((n) => table(n)), async () => {
				for (const name of names) await table(name).clear();
			});
			emit(names);
		},

		async putRows(name, rows) {
			if (!BACKUP_TABLES.includes(name)) throw new Error(`unknown table ${name}`);
			await table(name).bulkPut(rows);
			emit([name]);
		},

		async putBlobData(id, blob) {
			await blobData.put({ id, data: blob });
		}
	};
	return store;
}
