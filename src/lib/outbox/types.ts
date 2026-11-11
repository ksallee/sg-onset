// The outbox's types. An entry is one thing the server does not have yet: a record to create, fields
// to change, a record to delete, a file to upload. Types and two predicates.

/** What the server calls a record or a file. Opaque here: we store ids, never URLs. */
export type RemoteId = string | number;

export type RecordRef = { table: string; id: string };

/** One field changing. `base` is the value the server is believed to hold; `value` is ours. */
export type FieldEdit = { base: unknown; value: unknown };

export type CreateOp = { kind: 'create'; table: string; recordId: string; fields: Record<string, unknown> };
export type UpdateOp = { kind: 'update'; table: string; recordId: string; changes: Record<string, FieldEdit> };
export type DeleteOp = { kind: 'delete'; table: string; recordId: string };
/** A file of record `recordId` to upload. The bytes stay in the store, under `blobId`. */
export type BlobOp = { kind: 'blob'; table: string; recordId: string; blobId: string; size: number; type: string };

export type Op = CreateOp | UpdateOp | DeleteOp | BlobOp;

/**
 * - `pending`: never sent, or sent and known not to have landed.
 * - `inFlight`: an attempt has started. Written before the request leaves.
 * - `sentUnconfirmed`: an attempt may have landed: it timed out, the app died mid-attempt, the
 *   server refused a duplicate, or a file was uploaded and is not verified yet. Checked, not resent.
 * - `confirmed`: the server has it. The entry leaves the queue.
 * - `failedRetryable`: the server did not take it; tried again at `nextAttemptAt`.
 * - `needsAttention`: only a person can move it on. See `Attention`.
 */
export type EntryState = 'pending' | 'inFlight' | 'sentUnconfirmed' | 'confirmed' | 'failedRetryable' | 'needsAttention';

/** One field where the server changed under us. Nothing is overwritten until someone picks. */
export type FieldConflict = { key: string; base: unknown; local: unknown; server: unknown };

export type Attention =
	| { reason: 'conflict'; conflicts: FieldConflict[] }
	/** The server said no to this operation. */
	| { reason: 'refused'; message?: string }
	/** The server no longer has the record. */
	| { reason: 'gone' }
	/** Tried `maxAttempts` times. */
	| { reason: 'attempts' }
	/** The file to upload is not in the store. */
	| { reason: 'blobMissing' };

export type Entry = {
	/** Client UUID of the entry. */
	readonly id: string;
	/** Order of arrival. */
	readonly seq: number;
	readonly op: Op;
	/** Ids of the records the server must have before this can go: the parent and the linked records. */
	readonly dependsOn: readonly string[];
	readonly state: EntryState;
	/** Attempts started. */
	readonly attempts: number;
	readonly createdAt: number;
	/** `failedRetryable`: not before this time. `sentUnconfirmed`: check at this time. */
	readonly nextAttemptAt?: number;
	/** The server's id, once known: of the created record, or of the uploaded file. */
	readonly remoteId?: RemoteId;
	readonly attention?: Attention;
};

export type Queue = readonly Entry[];

/** What a new entry needs that a pure function cannot make. */
export type Fresh = { id: string; seq: number; now: number };

export type Policy = {
	/** Record operations in one batch. */
	maxOps: number;
	/** First retry delay. */
	baseMs: number;
	factor: number;
	/** Longest retry delay. */
	maxMs: number;
	/** Attempts before an entry needs attention. */
	maxAttempts: number;
	/** Tries of one part of a file before the upload counts as failed. */
	partTries: number;
	/** Fresh upload URLs asked for within one attempt. */
	urlRenewals: number;
	/** A part is not started on a URL with less than this left. */
	urlMarginMs: number;
	/** A transport call with no answer after this is treated as timed out. */
	callTimeoutMs: number;
};

export const DEFAULT_POLICY: Policy = {
	maxOps: 25,
	baseMs: 2_000,
	factor: 2,
	maxMs: 5 * 60_000,
	maxAttempts: 8,
	partTries: 3,
	urlRenewals: 3,
	urlMarginMs: 60_000,
	callTimeoutMs: 120_000
};

/** Not sent, so it can still be merged into or cancelled. */
export function isOpen(entry: Entry): boolean {
	return entry.state === 'pending' || entry.state === 'failedRetryable';
}

export function isActive(entry: Entry): boolean {
	return entry.state !== 'confirmed';
}
