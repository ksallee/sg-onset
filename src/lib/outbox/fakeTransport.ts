// An in-memory Transport that behaves like the server we measured: batches are all or nothing, a
// duplicate client UUID is refused, a timed-out batch may have committed, upload URLs expire, and
// an upload that answered may not be there. Tests tell it what to do wrong. No network.

import {
	TransportError,
	type BlobRef,
	type Found,
	type PushOp,
	type PushResult,
	type ReadRequest,
	type Refusal,
	type SentPart,
	type ServerRecord,
	type Transport,
	type TransportErrorKind,
	type UploadSession
} from './transport';
import type { RecordRef, RemoteId } from './types';

type Method = keyof Transport;
type Fault = { method: Method; kind: TransportErrorKind; commit: boolean };
type Row = { table: string; id: string; remoteId: number; fields: Record<string, unknown> };
type FileRow = { blobId: string; remoteId: string; size: number; recordRemoteId?: RemoteId };
type Token = { n: number; blob: BlobRef; sizes: Map<number, number>; dead: boolean };

export type FakeTransport = Transport & {
	/** Client UUID to server row. */
	rows: Map<string, Row>;
	/** Blob id to the file the server holds. */
	files: Map<string, FileRow>;
	/** False: every call throws `unreachable`. */
	online: boolean;
	/** False: every call throws `unauthorized`. */
	authorized: boolean;
	/** How long an upload URL lives. */
	urlLifetimeMs: number;
	/** Part size handed to the runner. Undefined: whole file. */
	partSize: number | undefined;
	/** Each part takes this long: the clock moves. */
	partDurationMs: number;
	/** False: an expired upload cannot be continued, only started again. */
	resumable: boolean;
	/** Every call, in order. */
	calls: { method: Method; detail?: unknown }[];
	/** Every batch pushed, landed or not. */
	batches: PushOp[][];
	/** Batches that broke the one-level rule. Must stay empty. */
	violations: string[];
	/** Runs at the start of every call: a hook for "meanwhile, the user did this". */
	onCall?: (method: Method) => void | Promise<void>;
	/** The next call of `method` throws `kind`. */
	failNext(method: Method, kind: TransportErrorKind, times?: number): void;
	/** The next call of `method` times out. `commit`: it lands anyway. */
	timeoutNext(method: Method, commit: boolean): void;
	/** The next `finishUpload` answers as if all went well, and keeps nothing. */
	loseNextUpload(): void;
	/** Someone else changes a record on the server. */
	serverEdit(id: string, fields: Record<string, unknown>): void;
	serverDelete(id: string): void;
	/** Puts a record on the server as if created earlier. */
	seed(table: string, id: string, fields?: Record<string, unknown>): number;
	count(method: Method): number;
};

export function fakeTransport(clock: { t: number }): FakeTransport {
	let nextId = 100;
	let nextSession = 1;
	let lose = false;
	const faults: Fault[] = [];

	async function enter(method: Method, detail?: unknown): Promise<Fault | undefined> {
		t.calls.push({ method, detail });
		await t.onCall?.(method);
		if (!t.online) throw new TransportError('unreachable');
		if (!t.authorized) throw new TransportError('unauthorized');
		const at = faults.findIndex((f) => f.method === method);
		if (at < 0) return undefined;
		const [fault] = faults.splice(at, 1);
		if (fault.commit) return fault;
		throw new TransportError(fault.kind);
	}

	function refusalsOf(ops: PushOp[]): Refusal[] {
		const refusals: Refusal[] = [];
		const made = new Set(ops.filter((o) => o.op.kind === 'create').map((o) => o.op.recordId));
		for (const o of ops) {
			const op = o.op;
			for (const dep of o.dependsOn) {
				if (dep === op.recordId) continue;
				if (made.has(dep)) t.violations.push(`${op.kind} ${op.recordId} links to ${dep}, created in the same batch`);
				else if (!t.rows.has(dep)) t.violations.push(`${op.kind} ${op.recordId} links to ${dep}, which the server lacks`);
				else if (o.links[dep] !== t.rows.get(dep)!.remoteId) t.violations.push(`${op.recordId}: wrong server id for ${dep}`);
				else continue;
				refusals.push({ entryId: o.entryId, reason: 'invalid', message: 'bad link' });
			}
			if (op.kind === 'create') {
				if (t.rows.has(op.recordId)) refusals.push({ entryId: o.entryId, reason: 'duplicate' });
				else if (op.fields.invalid === true) refusals.push({ entryId: o.entryId, reason: 'invalid', message: 'invalid' });
			} else if (!t.rows.has(op.recordId)) {
				refusals.push({ entryId: o.entryId, reason: 'gone' });
			} else if (o.remoteId !== t.rows.get(op.recordId)!.remoteId) {
				t.violations.push(`${op.kind} ${op.recordId}: wrong server id`);
				refusals.push({ entryId: o.entryId, reason: 'invalid', message: 'bad id' });
			}
		}
		return refusals;
	}

	function commit(ops: PushOp[]): Record<string, RemoteId> {
		const remoteIds: Record<string, RemoteId> = {};
		for (const o of ops) {
			const op = o.op;
			if (op.kind === 'create') {
				remoteIds[o.entryId] = t.seed(op.table, op.recordId, op.fields);
			} else if (op.kind === 'update') {
				const row = t.rows.get(op.recordId)!;
				for (const [key, c] of Object.entries(op.changes)) {
					if (c.value === undefined) delete row.fields[key];
					else row.fields[key] = c.value;
				}
			} else {
				t.rows.delete(op.recordId);
			}
		}
		return remoteIds;
	}

	const tokenOf = (session: UploadSession) => session.token as Token;
	const expired = (session: UploadSession) =>
		tokenOf(session).dead || (session.expiresAt !== undefined && clock.t > session.expiresAt);

	const t: FakeTransport = {
		rows: new Map(),
		files: new Map(),
		online: true,
		authorized: true,
		urlLifetimeMs: 840_000,
		partSize: undefined,
		partDurationMs: 0,
		resumable: true,
		calls: [],
		batches: [],
		violations: [],

		failNext(method, kind, times = 1) {
			for (let i = 0; i < times; i++) faults.push({ method, kind, commit: false });
		},
		timeoutNext(method, commit) {
			faults.push({ method, kind: 'timeout', commit });
		},
		loseNextUpload() {
			lose = true;
		},
		serverEdit(id, fields) {
			const row = t.rows.get(id);
			if (!row) throw new Error(`no server row ${id}`);
			Object.assign(row.fields, fields);
		},
		serverDelete(id) {
			t.rows.delete(id);
		},
		seed(table, id, fields = {}) {
			const remoteId = nextId++;
			t.rows.set(id, { table, id, remoteId, fields: structuredClone(fields) });
			return remoteId;
		},
		count(method) {
			return t.calls.filter((c) => c.method === method).length;
		},

		async push(ops): Promise<PushResult> {
			const fault = await enter('push', ops);
			t.batches.push(ops);
			const refusals = refusalsOf(ops);
			if (refusals.length) return { outcome: 'refused', refusals };
			const remoteIds = commit(ops);
			if (fault) throw new TransportError('timeout');
			return { outcome: 'applied', remoteIds };
		},

		async lookup(refs: RecordRef[]): Promise<Found[]> {
			await enter('lookup', refs);
			return refs.flatMap((r) => {
				const row = t.rows.get(r.id);
				return row ? [{ table: r.table, id: r.id, remoteId: row.remoteId }] : [];
			});
		},

		async read(requests: ReadRequest[]): Promise<ServerRecord[]> {
			await enter('read', requests);
			return requests.flatMap((r) => {
				const row = t.rows.get(r.id);
				if (!row) return [];
				const fields = Object.fromEntries(r.keys.filter((k) => k in row.fields).map((k) => [k, structuredClone(row.fields[k])]));
				return [{ table: r.table, id: r.id, remoteId: row.remoteId, fields }];
			});
		},

		async beginUpload(blob): Promise<UploadSession> {
			await enter('beginUpload', blob.blobId);
			const token: Token = { n: nextSession++, blob, sizes: new Map(), dead: false };
			return { token, expiresAt: clock.t + t.urlLifetimeMs, ...(t.partSize ? { partSize: t.partSize } : {}) };
		},

		async renewUpload(session): Promise<UploadSession> {
			await enter('renewUpload', tokenOf(session).n);
			if (!t.resumable) throw new TransportError('expired');
			return { ...session, expiresAt: clock.t + t.urlLifetimeMs };
		},

		async uploadPart(session, part): Promise<SentPart> {
			const fault = await enter('uploadPart', { session: tokenOf(session).n, index: part.index });
			clock.t += t.partDurationMs;
			if (expired(session)) throw new TransportError('expired');
			tokenOf(session).sizes.set(part.index, part.data.size);
			if (fault) throw new TransportError('timeout');
			return { index: part.index, etag: `etag-${part.index}` };
		},

		async finishUpload(session, parts) {
			const fault = await enter('finishUpload', tokenOf(session).n);
			if (expired(session)) throw new TransportError('expired');
			const token = tokenOf(session);
			token.dead = true;
			const size = parts.reduce((sum, p) => sum + (token.sizes.get(p.index) ?? 0), 0);
			const remoteId = `file-${token.n}`;
			if (lose) lose = false;
			else t.files.set(token.blob.blobId, { blobId: token.blob.blobId, remoteId, size, recordRemoteId: token.blob.recordRemoteId });
			if (fault) throw new TransportError('timeout');
			return { remoteId };
		},

		async verifyUpload(blob) {
			await enter('verifyUpload', blob.blobId);
			const file = t.files.get(blob.blobId);
			if (!file || file.size !== blob.size) return { verified: false };
			return { verified: true, remoteId: file.remoteId };
		}
	};
	return t;
}
