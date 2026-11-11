// Snapshots on IndexedDB: take, list, check, preview, restore, prune. The edge: transactions and
// streams. The rules are in the pure modules: `policy.ts`, `retention.ts`, `reconcile.ts`,
// `signals.ts`; the bytes in `codec.ts`.
//
// A snapshot reads every table in one read transaction, so it is one consistent moment. It is
// encoded and gzipped outside any transaction, then written in a short transaction over the
// snapshot tables only. It never holds a write transaction on the records.

import type Dexie from 'dexie';
import type { Table, Transaction } from 'dexie';
import { enqueue } from '$lib/outbox/queue';
import { unsynced } from '$lib/outbox/select';
import { isActive, type Entry, type Fresh } from '$lib/outbox/types';
import { TABLES } from '../tables';
import type { BlobMeta, StorageStatus } from '../types';
import { compress, decodeSnapshot, encodeRows, SnapshotCorrupt, snapshotZip } from './codec';
import type { Last } from './policy';
import { diffTables, planRestore, type Now, type RestorePlan, type Row, type Side, type TrashRow } from './reconcile';
import { budgetBytes, retain, type Retained } from './retention';
import type { OffDevice, SignalInput } from './signals';
import { kindOf, type RestorePreview, type SnapshotInfo, type SnapshotMeta, type SnapshotReason } from './types';
import { crc32 } from '../crc32';

/** What a snapshot holds: every record table and the store's own, but the photo bytes. */
export const SNAPSHOT_SOURCE = [...TABLES, 'blobs', 'outbox', 'remotes', 'trash', 'meta'] as const;

/**
 * - `notFound`: no such snapshot.
 * - `bad`: it fails its check. It is marked and never restored.
 * - `newerSchema`: taken by a later version of the app.
 * - `olderSchema`: taken under an older schema. Restore it only on purpose (`acceptOlderSchema`).
 * - `busy`: the store kept changing while the restore tried to start.
 */
export type SnapshotRefusal = 'notFound' | 'bad' | 'newerSchema' | 'olderSchema' | 'busy';

export class SnapshotError extends Error {
	constructor(
		readonly reason: SnapshotRefusal,
		message: string = reason
	) {
		super(message);
		this.name = 'SnapshotError';
	}
}

export interface Snapshots {
	/** Takes one now. Undefined when aborted. Retention runs after it. */
	take(reason: SnapshotReason, options?: { signal?: AbortSignal }): Promise<SnapshotInfo | undefined>;
	/** Newest first. `verify`: check every one not yet known bad, first. */
	list(options?: { verify?: boolean }): Promise<SnapshotInfo[]>;
	/** Checks one. False: it is now marked bad. */
	verify(id: string): Promise<boolean>;
	/** What restoring it would change now, in counts. Checks it first. */
	preview(id: string): Promise<RestorePreview>;
	/**
	 * Restores it. Takes a `beforeRestore` snapshot first: restoring that one undoes this. The
	 * queue is rebuilt against what Flow PT holds (see `reconcile.ts`).
	 */
	restore(id: string, options?: { acceptOlderSchema?: boolean }): Promise<{ before: SnapshotInfo; preview: RestorePreview }>;
	/** The snapshot as a backup zip with no files: `importBackup` takes it into an empty store. */
	zip(id: string): Promise<Blob>;
	/** Deletes snapshots, and the photo bytes only they still named. */
	drop(ids: readonly string[]): Promise<void>;
	/** Runs retention now. Also runs after every `take`. */
	prune(): Promise<Retained>;
	/** The newest good snapshot. */
	last(): Promise<Last | undefined>;
	/** The store's change counter. Higher than `last().seq`: changes not in a snapshot. */
	seq(): Promise<number>;
	/** The facts `backupSignals` reads. */
	status(): Promise<SignalInput>;
	/**
	 * Records an off-device copy. `export`: the user exported a backup zip. `sync`: a drain ended;
	 * recorded only when the whole queue is empty. True when recorded.
	 */
	markOffDevice(kind: 'sync' | 'export', at: number): Promise<boolean>;
	/** The photo bytes some snapshot names, and those a snapshot being taken is about to name. */
	pinned(): Promise<Set<string>>;
}

export type SnapshotHost = {
	db: Dexie;
	schemaVersion: number;
	now(): number;
	uuid(): string;
	emit(tables: string[]): void;
	storage(): Promise<StorageStatus>;
	/** The device's offset from UTC, for counting days. */
	tzOffsetMs?(): number;
};

type DataRow = { id: string; data: Blob };
type MetaRow = { key: string; value: number };

const OFF_DEVICE = { sync: 'offDevice.sync', export: 'offDevice.export', exportSeq: 'offDevice.exportSeq' } as const;

function info(meta: SnapshotMeta): SnapshotInfo {
	return {
		id: meta.id,
		at: meta.at,
		reason: meta.reason,
		kind: meta.kind,
		schemaVersion: meta.schemaVersion,
		counts: meta.counts,
		records: TABLES.reduce((sum, t) => sum + (meta.counts[t] ?? 0), 0),
		size: meta.size,
		verified: meta.bad ? false : meta.checkedAt !== undefined ? true : undefined
	};
}

function seqOf(rows: Record<string, unknown[]>): number {
	return ((rows.meta ?? []) as MetaRow[]).find((m) => m.key === 'seq')?.value ?? 0;
}

/** The files with bytes on the device: what a snapshot must keep. */
function withBytes(rows: Record<string, unknown[]>): string[] {
	return ((rows.blobs ?? []) as BlobMeta[]).filter((b) => b.prunedAt === undefined).map((b) => b.id);
}

function sideOf(rows: Record<string, unknown[]>): Side {
	const tables: Side['tables'] = {};
	for (const t of TABLES) if (rows[t]) tables[t] = rows[t] as Row[];
	return { tables, trash: (rows.trash ?? []) as TrashRow[], blobs: (rows.blobs ?? []) as BlobMeta[] };
}

/**
 * Takes a snapshot inside a schema upgrade, of the rows as the old version left them. All
 * synchronous but the reads: IndexedDB commits an upgrade that waits on anything else. Stored as a
 * plain zip. Best effort: a snapshot that cannot be written does not stop the upgrade.
 */
export async function migrationSnapshot(tx: Transaction, at: { id: string; now: number; fromVersion: number }): Promise<void> {
	try {
		const names = SNAPSHOT_SOURCE.filter((n) => tx.storeNames.includes(n));
		const rows: Record<string, unknown[]> = {};
		for (const name of names) rows[name] = await tx.table(name).toArray();
		const zip = encodeRows(rows, { schemaVersion: at.fromVersion, at: at.now });
		const meta: SnapshotMeta = {
			id: at.id,
			at: at.now,
			reason: 'migration',
			kind: 'risky',
			schemaVersion: at.fromVersion,
			seq: seqOf(rows),
			counts: zip.counts,
			size: zip.bytes.length,
			rawSize: zip.rawSize,
			encoding: 'zip',
			crc: crc32(zip.bytes),
			blobIds: withBytes(rows)
		};
		await tx.table('snapshotData').add({ id: meta.id, data: new Blob([zip.bytes as BlobPart]) });
		await tx.table('snapshots').add(meta);
	} catch {
		// The upgrade matters more than its snapshot.
	}
}

export function createSnapshots(host: SnapshotHost): Snapshots {
	const { db } = host;
	const table = <T>(name: string): Table<T, string> => db.table(name);
	const snapshots = () => table<SnapshotMeta>('snapshots');
	const snapshotData = () => table<DataRow>('snapshotData');
	const meta = () => table<MetaRow>('meta');
	const tzOffsetMs = host.tzOffsetMs ?? (() => -new Date(host.now()).getTimezoneOffset() * 60_000);
	/** Files a snapshot being taken has read and not yet written. */
	const pinning = new Set<string>();
	let overBudget = false;

	async function readAll(): Promise<Record<string, unknown[]>> {
		return db.transaction('r', [...SNAPSHOT_SOURCE].map((n) => table(n)), async () => {
			const rows: Record<string, unknown[]> = {};
			for (const name of SNAPSHOT_SOURCE) rows[name] = await table(name).toArray();
			return rows;
		});
	}

	async function load(id: string): Promise<{ meta: SnapshotMeta; rows: Record<string, unknown[]> }> {
		const [row, data] = await Promise.all([snapshots().get(id), snapshotData().get(id)]);
		if (!row) throw new SnapshotError('notFound');
		if (row.bad) throw new SnapshotError('bad');
		try {
			if (!data) throw new SnapshotCorrupt('no bytes');
			const rows = await decodeSnapshot(row, data.data);
			await snapshots().update(id, { checkedAt: host.now() });
			return { meta: { ...row, checkedAt: host.now() }, rows };
		} catch (error) {
			if (!(error instanceof SnapshotCorrupt)) throw error;
			await snapshots().update(id, { bad: true });
			host.emit(['snapshots']);
			throw new SnapshotError('bad', error.message);
		}
	}

	async function current(): Promise<Now> {
		const rows = await readAll();
		return { ...sideOf(rows), queue: rows.outbox as Entry[], remotes: new Set((rows.remotes as { id: string }[]).map((r) => r.id)) };
	}

	function preview(snapshot: SnapshotMeta, rows: Record<string, unknown[]>, now: Now, plan: RestorePlan): RestorePreview {
		const live = (side: Side) => Object.fromEntries(TABLES.map((t) => [t, side.tables[t] ?? []]));
		const tables = diffTables(live(sideOf(rows)), live(now));
		const sum = (k: 'added' | 'removed' | 'changed') => Object.values(tables).reduce((n, d) => n + d[k], 0);
		return { snapshot: info(snapshot), tables, added: sum('added'), removed: sum('removed'), changed: sum('changed'), queued: plan.ops.length };
	}

	async function drop(ids: readonly string[]): Promise<void> {
		if (!ids.length) return;
		await db.transaction('rw', ['snapshots', 'snapshotData', 'blobs', 'blobData'].map((n) => table(n)), async () => {
			await snapshots().bulkDelete([...ids]);
			await snapshotData().bulkDelete([...ids]);
			// Bytes no description and no snapshot names any more go.
			const pinned = new Set([...((await snapshots().orderBy('blobIds').uniqueKeys()) as string[]), ...pinning]);
			const described = new Set(await table('blobs').toCollection().primaryKeys());
			const stray = (await table('blobData').toCollection().primaryKeys()).filter((id) => !described.has(id) && !pinned.has(id as string));
			await table('blobData').bulkDelete(stray);
		});
		host.emit(['snapshots', 'blobs']);
	}

	async function retained(): Promise<{ result: Retained; rows: SnapshotMeta[] }> {
		const rows = await snapshots().toArray();
		const status = await host.storage();
		const result = retain(rows, { now: host.now(), budgetBytes: budgetBytes(status), tzOffsetMs: tzOffsetMs() });
		return { result, rows };
	}

	const api: Snapshots = {
		async take(reason, options = {}) {
			const { signal } = options;
			if (signal?.aborted) return undefined;
			const at = host.now();
			const rows = await readAll();
			const blobIds = withBytes(rows);
			for (const id of blobIds) pinning.add(id);
			try {
				if (signal?.aborted) return undefined;
				const encoded = await compress(encodeRows(rows, { schemaVersion: host.schemaVersion, at }));
				if (signal?.aborted) return undefined;
				const row: SnapshotMeta = {
					id: host.uuid(),
					at,
					reason,
					kind: kindOf(reason),
					schemaVersion: host.schemaVersion,
					seq: seqOf(rows),
					counts: encoded.counts,
					size: encoded.bytes.length,
					rawSize: encoded.rawSize,
					encoding: encoded.encoding,
					crc: encoded.crc,
					blobIds
				};
				await db.transaction('rw', [snapshots(), snapshotData()], async () => {
					await snapshotData().add({ id: row.id, data: new Blob([encoded.bytes as BlobPart]) });
					await snapshots().add(row);
				});
				host.emit(['snapshots']);
				// Read back and check what was written.
				const ok = await api.verify(row.id);
				try {
					await api.prune();
				} catch {
					// Retention runs again after the next one.
				}
				return info({ ...row, ...(ok ? { checkedAt: host.now() } : { bad: true }) });
			} finally {
				for (const id of blobIds) pinning.delete(id);
			}
		},

		async list(options = {}) {
			if (options.verify) {
				for (const row of await snapshots().toArray()) if (!row.bad) await api.verify(row.id);
			}
			return (await snapshots().orderBy('at').reverse().toArray()).map(info);
		},

		async verify(id) {
			try {
				await load(id);
				return true;
			} catch (error) {
				if (error instanceof SnapshotError && (error.reason === 'bad' || error.reason === 'notFound')) return false;
				throw error;
			}
		},

		async preview(id) {
			const { meta: snap, rows } = await load(id);
			const now = await current();
			return preview(snap, rows, now, planRestore(sideOf(rows), now, host.now()));
		},

		async restore(id, options = {}) {
			const { meta: snap, rows } = await load(id);
			if (snap.schemaVersion > host.schemaVersion) throw new SnapshotError('newerSchema');
			if (snap.schemaVersion < host.schemaVersion && !options.acceptOlderSchema) throw new SnapshotError('olderSchema');
			const then = sideOf(rows);
			for (let attempt = 0; attempt < 3; attempt++) {
				const before = await api.take('beforeRestore');
				if (!before) throw new SnapshotError('busy');
				const beforeSeq = (await snapshots().get(before.id))!.seq;
				const done = await db.transaction('rw', [...SNAPSHOT_SOURCE].map((n) => table(n)), async () => {
					const seq = (await meta().get('seq'))?.value ?? 0;
					// Something changed since the before-restore snapshot: it would not undo this.
					if (seq !== beforeSeq) return undefined;
					const rowsNow: Record<string, unknown[]> = {};
					for (const name of SNAPSHOT_SOURCE) rowsNow[name] = await table(name).toArray();
					const now: Now = { ...sideOf(rowsNow), queue: rowsNow.outbox as Entry[], remotes: new Set((rowsNow.remotes as { id: string }[]).map((r) => r.id)) };
					const plan = planRestore(then, now, host.now());

					for (const t of TABLES) {
						await table(t).clear();
						await table(t).bulkPut(plan.tables[t] ?? []);
					}
					await table('trash').clear();
					await table('trash').bulkPut(plan.trash);
					await table('blobs').clear();
					await table('blobs').bulkPut(plan.blobs);

					const at = host.now();
					const stamps: Fresh[] = plan.ops.map((_, i) => ({ id: host.uuid(), seq: seq + 1 + i, now: at }));
					const queue = plan.ops.reduce<Entry[]>((q, o, i) => enqueue(q, o.op, o.dependsOn, stamps[i]), [...plan.queue]);
					await table('outbox').clear();
					await table('outbox').bulkPut(queue);
					await meta().put({ key: 'seq', value: seq + plan.ops.length });
					return preview(snap, rows, now, plan);
				});
				if (!done) continue;
				host.emit([...TABLES, 'blobs', 'trash', 'outbox', 'snapshots']);
				return { before, preview: done };
			}
			throw new SnapshotError('busy');
		},

		async zip(id) {
			const row = await snapshots().get(id);
			const data = await snapshotData().get(id);
			if (!row || !data) throw new SnapshotError('notFound');
			try {
				return await snapshotZip(row, data.data);
			} catch (error) {
				if (error instanceof SnapshotCorrupt) throw new SnapshotError('bad', error.message);
				throw error;
			}
		},

		drop,

		async prune() {
			const { result } = await retained();
			overBudget = result.overBudget;
			await drop(result.drop);
			return result;
		},

		async last() {
			const newest = (await snapshots().orderBy('at').reverse().toArray()).find((r) => !r.bad);
			return newest ? { at: newest.at, seq: newest.seq } : undefined;
		},

		async seq() {
			return (await meta().get('seq'))?.value ?? 0;
		},

		async status() {
			const rows = await snapshots().orderBy('at').reverse().toArray();
			const newest = rows.find((r) => !r.bad);
			const keys = await meta().bulkGet(Object.values(OFF_DEVICE));
			const [sync, exported, exportSeq] = keys.map((k) => k?.value);
			const offDevice: OffDevice = {
				...(sync !== undefined ? { sync } : {}),
				...(exported !== undefined ? { export: exported } : {}),
				...(exportSeq !== undefined ? { exportSeq } : {})
			};
			const queue = unsynced(await table<Entry>('outbox').toArray());
			const storage = await host.storage();
			return {
				seq: await api.seq(),
				lastSnapshot: newest ? { at: newest.at, seq: newest.seq } : undefined,
				newestBad: rows[0]?.bad === true,
				overBudget,
				offDevice,
				queue: { entries: queue.entries, records: queue.records, ...(queue.oldest !== undefined ? { oldest: queue.oldest } : {}) },
				persisted: storage.persisted
			};
		},

		async markOffDevice(kind, at) {
			const marked = await db.transaction('rw', [meta(), table('outbox')], async () => {
				if (kind === 'sync') {
					const open = (await table<Entry>('outbox').toArray()).some(isActive);
					if (open) return false;
					await meta().put({ key: OFF_DEVICE.sync, value: at });
					return true;
				}
				const seq = (await meta().get('seq'))?.value ?? 0;
				await meta().bulkPut([
					{ key: OFF_DEVICE.export, value: at },
					{ key: OFF_DEVICE.exportSeq, value: seq }
				]);
				return true;
			});
			if (marked) host.emit(['meta']);
			return marked;
		},

		async pinned() {
			if (!db.tables.some((t) => t.name === 'snapshots')) return new Set(pinning);
			return new Set([...((await snapshots().orderBy('blobIds').uniqueKeys()) as string[]), ...pinning]);
		}
	};
	return api;
}
