// The snapshots' types. A snapshot is the whole store but the photo bytes, at one moment, kept on
// the device so a bad edit, a bug or a failed migration can be taken back. Types only.

/**
 * Why a snapshot was taken.
 * - `changes`: changes piled up, or time passed since the last one with changes since.
 * - `hidden`: the page was hidden with changes not in a snapshot.
 * - `migration`: the schema was about to be upgraded.
 * - `zipRestore`: a backup zip was about to replace the store.
 * - `deleteProject`, `deleteShootDay`: about to delete a project or a shoot day and what is under it.
 * - `templateEdit`, `bulkEdit`: about to change many entries at once.
 * - `beforeRestore`: about to restore a snapshot. Restoring this one undoes the restore.
 * - `manual`: asked for by a person.
 */
export type SnapshotReason =
	| 'changes'
	| 'hidden'
	| 'migration'
	| 'zipRestore'
	| 'deleteProject'
	| 'deleteShootDay'
	| 'templateEdit'
	| 'bulkEdit'
	| 'beforeRestore'
	| 'manual';

/** The reasons that come before something risky. */
export type RiskyReason = Exclude<SnapshotReason, 'changes' | 'hidden'>;

/** `auto`: taken on a schedule. `risky`: taken before a risky operation. */
export type SnapshotKind = 'auto' | 'risky';

export function kindOf(reason: SnapshotReason): SnapshotKind {
	return reason === 'changes' || reason === 'hidden' ? 'auto' : 'risky';
}

/**
 * - `zip`: a stored zip in the backup's layout.
 * - `zip+gzip`: the same, gzipped. Taken when `CompressionStream` exists and outside an upgrade.
 */
export type SnapshotEncoding = 'zip' | 'zip+gzip';

/** One snapshot, without its bytes. A row of the `snapshots` table. */
export type SnapshotMeta = {
	id: string;
	/** When the rows were read, ms. */
	at: number;
	reason: SnapshotReason;
	kind: SnapshotKind;
	/** The schema version the rows were written under. */
	schemaVersion: number;
	/** The store's change counter when the rows were read. Higher now: changes since. */
	seq: number;
	/** Rows per table. */
	counts: Record<string, number>;
	/** Bytes stored. */
	size: number;
	/** Bytes of the zip before gzip. */
	rawSize: number;
	encoding: SnapshotEncoding;
	/** CRC-32 of the stored bytes. */
	crc: number;
	/** The files the snapshot's rows describe. Their bytes stay while the snapshot is kept. */
	blobIds: string[];
	/** When it last passed its check. */
	checkedAt?: number;
	/** It failed its check. Never restored, dropped by the next retention. */
	bad?: true;
};

/** What the UI lists. */
export type SnapshotInfo = {
	id: string;
	at: number;
	reason: SnapshotReason;
	kind: SnapshotKind;
	schemaVersion: number;
	/** Rows per table: the record tables, and the queue, server ids, trash, file descriptions. */
	counts: Record<string, number>;
	/** Records in all, across the record tables. */
	records: number;
	size: number;
	/** `true`: checked and good. `false`: failed its check. `undefined`: not checked yet. */
	verified: boolean | undefined;
};

/** Records added, removed and changed in one table if a snapshot were restored now. */
export type TableDiff = { added: number; removed: number; changed: number };

export type RestorePreview = {
	snapshot: SnapshotInfo;
	/** Only the tables with a difference. */
	tables: Record<string, TableDiff>;
	added: number;
	removed: number;
	changed: number;
	/** Changes the restore will queue for Flow PT. */
	queued: number;
};
