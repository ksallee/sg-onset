// The port: what the runner asks of storage. The Dexie store implements it; `memoryPort` is the
// in-memory one for tests and for a store that is not IndexedDB.

import { prune } from './machine';
import type { Entry, Queue, RemoteId } from './types';

export interface OutboxPort {
	/** The whole queue, in order of arrival. */
	entries(): Promise<Entry[]>;
	/**
	 * Reads the queue, runs `fn` on it and writes the result, as one transaction. `fn` is pure and
	 * synchronous. Entries `fn` confirmed are settled (see `settle`) and leave the queue. Returns
	 * the queue as written.
	 */
	update(fn: (queue: Queue) => Queue): Promise<Entry[]>;
	/** The server ids known for these client UUIDs. */
	remoteIds(ids: readonly string[]): Promise<Record<string, RemoteId>>;
	/** The bytes of a file, if the store still has them. */
	blob(blobId: string): Promise<Blob | undefined>;
}

/** What confirming entries means for storage. */
export type Settled = {
	/** The queue without the confirmed entries. */
	queue: Entry[];
	/** Created records: keep the server id. */
	created: { table: string; id: string; remoteId: RemoteId }[];
	/** Deleted records: the server confirmed, so the local copy and its files can go. */
	deleted: { table: string; id: string }[];
	/** Verified uploads: the local bytes may be freed after the retention time. */
	verified: { blobId: string; remoteId?: RemoteId }[];
};

/** Pure: sorts the newly confirmed entries of `next` by what storage must do about them. */
export function settle(next: Queue): Settled {
	const out: Settled = { queue: prune(next), created: [], deleted: [], verified: [] };
	for (const e of next) {
		if (e.state !== 'confirmed') continue;
		const op = e.op;
		if (op.kind === 'create' && e.remoteId !== undefined) {
			out.created.push({ table: op.table, id: op.recordId, remoteId: e.remoteId });
		}
		if (op.kind === 'delete') out.deleted.push({ table: op.table, id: op.recordId });
		if (op.kind === 'blob') {
			out.verified.push({ blobId: op.blobId, ...(e.remoteId !== undefined ? { remoteId: e.remoteId } : {}) });
		}
	}
	return out;
}

export type MemoryPort = OutboxPort & {
	queue: Entry[];
	remotes: Map<string, RemoteId>;
	blobs: Map<string, Blob>;
	verified: Map<string, RemoteId | undefined>;
};

/** A port over plain arrays and maps. */
export function memoryPort(queue: Queue = []): MemoryPort {
	const port: MemoryPort = {
		queue: [...queue],
		remotes: new Map(),
		blobs: new Map(),
		verified: new Map(),
		async entries() {
			return [...port.queue].sort((a, b) => a.seq - b.seq);
		},
		async update(fn) {
			const settled = settle(fn(await port.entries()));
			for (const c of settled.created) port.remotes.set(c.id, c.remoteId);
			for (const d of settled.deleted) port.remotes.delete(d.id);
			for (const v of settled.verified) port.verified.set(v.blobId, v.remoteId);
			port.queue = settled.queue;
			return [...port.queue];
		},
		async remoteIds(ids) {
			const found: Record<string, RemoteId> = {};
			for (const id of ids) if (port.remotes.has(id)) found[id] = port.remotes.get(id)!;
			return found;
		},
		async blob(blobId) {
			return port.blobs.get(blobId);
		}
	};
	return port;
}
