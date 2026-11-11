// The Transport: everything the outbox asks of a server. The outbox knows no server: the mapping
// from our records to the server's entities and fields lives in the implementation. The FPT one is
// not written yet; `fakeTransport.ts` is the in-memory one the tests use.
//
// A method answers when the server gave a definite answer. Trouble is thrown as a
// `TransportError`. Anything else thrown is treated as `timeout`: it may have landed.

import type { BlobOp, Op, RecordRef, RemoteId } from './types';

/**
 * - `unreachable`: no network. The request never left. Nothing landed.
 * - `unauthorized`: no valid session. Nothing landed. The runner stops until sign-in.
 * - `failed`: the server answered with a passing error (5xx, rate limit). Nothing landed.
 * - `timeout`: no answer. It may have landed.
 * - `expired`: the upload URL is dead. Ask for a new one.
 */
export type TransportErrorKind = 'unreachable' | 'unauthorized' | 'failed' | 'timeout' | 'expired';

export class TransportError extends Error {
	constructor(
		readonly kind: TransportErrorKind,
		message: string = kind
	) {
		super(message);
		this.name = 'TransportError';
	}
}

/** One operation of a batch, with the server ids it needs. */
export type PushOp = {
	/** The outbox entry. Results and refusals name it. */
	entryId: string;
	op: Exclude<Op, BlobOp>;
	/** The server's id of the record, for an update or a delete. */
	remoteId?: RemoteId;
	/** Client UUIDs of the records this operation links to: the parent and the linked records. */
	dependsOn: readonly string[];
	/** Their server ids, by client UUID. */
	links: Record<string, RemoteId>;
};

/**
 * - `duplicate`: a create whose client UUID the server already has. It was created before: the
 *   runner looks it up.
 * - `invalid`: the server will never take this operation as it is.
 * - `gone`: the record to update or delete is not there.
 */
export type Refusal = { entryId: string; reason: 'duplicate' | 'invalid' | 'gone'; message?: string };

export type PushResult =
	/** Every operation landed. `remoteIds`: entry id to the server id of each created record. */
	| { outcome: 'applied'; remoteIds: Record<string, RemoteId> }
	/** Nothing landed. `refusals` name the operations at fault; the rest are sent again. */
	| { outcome: 'refused'; refusals: Refusal[] };

export type ReadRequest = RecordRef & { remoteId?: RemoteId; keys: string[] };

/** The record's server id and the server's values of the keys asked for, in our field form. */
export type ServerRecord = RecordRef & { remoteId: RemoteId; fields: Record<string, unknown> };

export type Found = RecordRef & { remoteId: RemoteId };

/** A file to upload, and the server id of the record it belongs to. */
export type BlobRef = Omit<BlobOp, 'kind'> & { recordRemoteId?: RemoteId };

export type UploadSession = {
	/** The transport's own handle. Opaque to the runner, never stored. */
	token: unknown;
	/** When the upload URLs die. Absent: they do not. */
	expiresAt?: number;
	/** Cut the file into parts of this many bytes. Absent: send it whole. */
	partSize?: number;
};

export type SentPart = { index: number; etag?: string };

export interface Transport {
	/**
	 * One batch, one dependency level: no operation links to a record created in the same batch.
	 * All or nothing. Every create carries the client UUID in a field the server keeps unique, so
	 * a create sent twice is refused as `duplicate`, not made twice.
	 */
	push(ops: PushOp[], signal?: AbortSignal): Promise<PushResult>;

	/** Finds records by client UUID. Returns the ones the server has. */
	lookup(refs: RecordRef[], signal?: AbortSignal): Promise<Found[]>;

	/** The server's current values of some fields. A record the server lacks is left out. */
	read(requests: ReadRequest[], signal?: AbortSignal): Promise<ServerRecord[]>;

	/** Starts an upload. */
	beginUpload(blob: BlobRef, signal?: AbortSignal): Promise<UploadSession>;

	/**
	 * Fresh URLs for an upload under way, keeping the parts already sent. Throws `expired` when
	 * the upload cannot be continued: the runner then begins again from the first part.
	 */
	renewUpload(session: UploadSession, signal?: AbortSignal): Promise<UploadSession>;

	/** Sends one part. Throws `expired` when the URL is dead. */
	uploadPart(session: UploadSession, part: { index: number; data: Blob }, signal?: AbortSignal): Promise<SentPart>;

	/** Completes the upload and attaches the file. An answer here proves nothing: see `verifyUpload`. */
	finishUpload(session: UploadSession, parts: SentPart[], signal?: AbortSignal): Promise<{ remoteId?: RemoteId }>;

	/** Is the file on the server, whole and attached to its record. `remoteId`: what `finishUpload` gave. */
	verifyUpload(blob: BlobRef, remoteId?: RemoteId, signal?: AbortSignal): Promise<{ verified: boolean; remoteId?: RemoteId }>;
}
