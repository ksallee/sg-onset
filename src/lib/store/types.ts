// The Store: what the app asks of on-device storage. The Dexie (IndexedDB) store implements it; a
// Capacitor store (SQLite, files) can replace it later without the app noticing. Types only.

import type { Patch } from '$lib/model/patch';
import type { Entry, FieldConflict, RemoteId } from '$lib/outbox/types';
import type { OutboxPort } from '$lib/outbox/port';
import type { Unsynced } from '$lib/outbox/select';
import type { Snapshots } from './snapshots/snapshots';
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
	/**
	 * A file made by the app: `annotated`, a photo with its drawing flattened on it, a file of the
	 * still; `diagram`, a slate's setup diagram as an image, a file of the slate.
	 */
	variant?: BlobVariant;
	/** What it was made from: the key of the drawing (`$lib/draw/markup`, `$lib/draw/diagram`). */
	source?: string;
};

export type BlobVariant = 'annotated' | 'diagram';

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

/** What changed. Table names, plus `outbox`, `blobs`, `trash`, `snapshots`, `meta`. */
export type StoreEvent = { tables: readonly string[] };

export type NewBlob = { blob: Blob; id?: string; name?: string; variant?: BlobVariant; source?: string };

type AnyRow = { id: string } & Record<string, unknown>;

/** What `reconcile` reads, in its transaction, for the plan to decide from. */
export type ReconcileState = {
	/** Every record of the table. */
	rows: AnyRow[];
	/** Every record of the tables that may use one of them. */
	users: Partial<Record<TableName, AnyRow[]>>;
	/** The server ids known, by client UUID. */
	remotes: Record<string, RemoteId>;
	/** The whole queue. */
	entries: Entry[];
	/** The ids of the table's records in the trash. */
	trashed: Set<string>;
};

/** What `reconcile` applies (app/sync/shared.ts makes it). */
export type ReconcilePlan = {
	/** Records to put, nothing queued. */
	add: AnyRow[];
	/** Values to set, nothing queued. `undefined` clears the field. */
	change: { id: string; set: Record<string, unknown> }[];
	/** Records to take off the device, with their server id. Nothing queued. */
	remove: string[];
	/** Records whose server copy is gone: their server id and their unsent edits go, and a create of the record as it is is queued. */
	resend: string[];
	/** Records the server never had: a create is queued. */
	push: string[];
	/** Server ids to keep. */
	remoteIds: Record<string, RemoteId>;
	/**
	 * Links to write again on records of the `users` tables: an update of `key` from no link to
	 * `value`, queued after the creates (findings/161: a link to a deleted row reads as none).
	 */
	relink?: { table: TableName; id: string; key: string; value: string }[];
};

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
	/**
	 * Takes back a file whose upload has not left: its description, its bytes (unless a snapshot
	 * names them) and its queued upload. False when the upload has left, may have landed, or was
	 * seen on the server: the file stays. For a copy replaced before it was sent.
	 */
	dropBlob(id: string): Promise<boolean>;

	// Sync.
	/** The queue, for the runner. */
	outbox: OutboxPort;
	unsynced(): Promise<Unsynced>;
	/** Settles a conflict. `theirs` sets the local field to the server value, without queueing. */
	resolve(entryId: string, pick: (conflict: FieldConflict) => 'mine' | 'theirs'): Promise<void>;
	/** Sends an entry that needed attention again. */
	retry(entryId: string): Promise<void>;
	remoteId(id: string): Promise<RemoteId | undefined>;
	/**
	 * Brings the records of `table` in line with what the server holds (#110), in one transaction:
	 * reads the table, the `users` tables, the queue, the server ids and the trash, and applies what
	 * `plan` returns from them. Puts, changes and removes records without queueing; queues a create
	 * only for `resend` and `push`. Returns the plan.
	 */
	reconcile<P extends ReconcilePlan>(table: TableName, users: readonly TableName[], plan: (state: ReconcileState) => P): Promise<P>;
	/**
	 * An optional field a site lacked is there now (#138, app/sync/waiting.ts): the key leaves every
	 * unsent update of the table, and an update of it, from no value, is queued for each record that
	 * holds a value. One transaction.
	 */
	refill(table: TableName, key: string): Promise<void>;

	/** Rolling snapshots of the whole store but the photo bytes: `snapshots/`. */
	snapshots: Snapshots;

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
