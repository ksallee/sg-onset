// The Store: what the app asks of on-device storage. The Dexie (IndexedDB) store implements it; a
// Capacitor store (SQLite, files) can replace it later without the app noticing. Types only.

import type { Patch } from '$lib/model/patch';
import type { FieldConflict, RemoteId } from '$lib/outbox/types';
import type { OutboxPort } from '$lib/outbox/port';
import type { Unsynced } from '$lib/outbox/select';
import type { RowOf, TableName } from './tables';

/** A stored file, without its bytes. */
export type BlobMeta = {
	id: string;
	/** The record the file belongs to. */
	table: TableName;
	recordId: string;
	name?: string;
	/** MIME type. */
	type: string;
	size: number;
	createdAt: number;
	/** When the server was seen to hold the file. Absent: not verified, the bytes must stay. */
	verifiedAt?: number;
	/** The server's id of the file. */
	remoteId?: RemoteId;
	/** When the local bytes were freed. The file is then on the server only. */
	prunedAt?: number;
};

export type StorageStatus = {
	/** The browser has promised not to evict our data under pressure. */
	persisted: boolean;
	/** Bytes used by this origin, when the browser says. */
	usage?: number;
	/** Bytes this origin may use, when the browser says. */
	quota?: number;
	/** `quota - usage`. */
	free?: number;
	/** `usage / quota`, 0 to 1. */
	usedFraction?: number;
};

/** What changed. Table names, plus `outbox`, `blobs`, `trash`. */
export type StoreEvent = { tables: readonly string[] };

export type NewBlob = { blob: Blob; id?: string; name?: string };

export interface Store {
	// Reads. Plain promises.
	get<T extends TableName>(table: T, id: string): Promise<RowOf<T> | undefined>;
	/** The records of a table; with `parentId`, the children of that record. */
	list<T extends TableName>(table: T, parentId?: string): Promise<RowOf<T>[]>;

	// Writes. Each is one transaction: the record change and its outbox entry land together or not
	// at all.
	/** Adds a record, and with `attach` its file. */
	create<T extends TableName>(table: T, record: RowOf<T>, attach?: NewBlob): Promise<void>;
	/**
	 * Applies a model patch and queues it. Returns the patch as applied, with the stored values as
	 * `from`: `apply(table, invertPatch(returned))` is the undo, and it is queued like any edit.
	 */
	apply(table: TableName, patch: Patch): Promise<Patch>;
	/** Moves a record to the trash and queues the delete. Its files stay until the server confirms. */
	remove(table: TableName, id: string): Promise<void>;
	/** Brings a record back from the trash. False when it is too late: the delete was sent. */
	restore(table: TableName, id: string): Promise<boolean>;
	/** Empties the trash of what was removed before `before` and never reached the server. */
	purgeTrash(before: number): Promise<number>;

	// Files.
	putBlob(table: TableName, recordId: string, file: NewBlob): Promise<BlobMeta>;
	/** The bytes. Undefined when unknown or pruned. */
	blob(id: string): Promise<Blob | undefined>;
	blobsOf(recordId: string): Promise<BlobMeta[]>;
	/** Frees the bytes of files the server has held for longer than `keepMs`. Returns how many. */
	pruneBlobs(keepMs?: number): Promise<number>;

	// Sync.
	/** The queue, for the runner. */
	outbox: OutboxPort;
	unsynced(): Promise<Unsynced>;
	/** Settles a conflict. `theirs` sets the local field to the server value, without queueing. */
	resolve(entryId: string, pick: (conflict: FieldConflict) => 'mine' | 'theirs'): Promise<void>;
	/** Sends an entry that needed attention again. */
	retry(entryId: string): Promise<void>;
	remoteId(id: string): Promise<RemoteId | undefined>;

	/** Calls `listener` after every committed change. Returns the unsubscribe. */
	subscribe(listener: (event: StoreEvent) => void): () => void;

	// Storage.
	/** Asks the browser to keep our data. Call after a tap. The answer is kept in `storage()`. */
	persist(): Promise<boolean>;
	storage(): Promise<StorageStatus>;

	close(): void;
}

/** What a backup reads from a store. */
export interface BackupSource {
	schemaVersion: number;
	/** Every table to back up: the record tables and the store's own. */
	tableNames(): string[];
	rows(table: string): Promise<unknown[]>;
	blobIds(): Promise<string[]>;
	blob(id: string): Promise<Blob | undefined>;
}

/** What a restore writes to a store. */
export interface BackupTarget {
	schemaVersion: number;
	tableNames(): string[];
	isEmpty(): Promise<boolean>;
	clear(): Promise<void>;
	putRows(table: string, rows: unknown[]): Promise<void>;
	putBlobData(id: string, blob: Blob): Promise<void>;
}
