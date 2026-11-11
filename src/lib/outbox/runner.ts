// The runner: drains the queue through a Transport. This is the edge: it does the I/O and holds
// no rules of its own. What to send, in what order, and what an answer means are decided by the
// pure modules beside it.
//
// One drain is a loop of small steps. Each step reads the queue, does one thing (check the
// maybe-sent entries, push one batch, upload one file) and writes the outcome. An entry is written
// as in flight before its request leaves, so a drain that dies mid-request leaves a trace, and
// the next drain checks those entries instead of sending them again.

import { applyServerRead } from './conflict';
import { deferCheck, markApplied, markAttention, markFailed, markInFlight, markSent, markUnknown, markUnsent, recover, settleCheck } from './machine';
import { planBatch } from './plan';
import type { OutboxPort } from './port';
import { judge, type Evidence } from './recovery';
import { unsynced, type Unsynced } from './select';
import { TransportError, type BlobRef, type PushOp, type SentPart, type Transport, type TransportErrorKind, type UploadSession } from './transport';
import { DEFAULT_POLICY, isOpen, type BlobOp, type Entry, type Policy, type RemoteId } from './types';
import { expiring, partMargin, planParts } from './upload';

export type RunnerEnv = {
	now(): number;
	/** Is the page in the foreground. Sync runs only there. */
	visible(): boolean;
	online(): boolean;
	/** 0 to 1, for the retry jitter. */
	random(): number;
	/** Runs `fn` after `ms`; returns the cancel. Absent: transport calls have no timeout of ours. */
	timer?(ms: number, fn: () => void): () => void;
};

/**
 * - `idle`: nothing left that the runner can move. Entries needing attention may remain.
 * - `waiting`: retries or checks are scheduled; drain again at `waitUntil`.
 * - `hidden`: the page left the foreground, or `stop()` was called.
 * - `offline`: no network.
 * - `unauthorized`: the session is gone; sign in, then drain.
 */
export type StopReason = 'idle' | 'waiting' | 'hidden' | 'offline' | 'unauthorized';

export type DrainReport = { stopped: StopReason; waitUntil?: number; unsynced: Unsynced };

export type Progress = {
	phase: 'checking' | 'sending' | 'uploading' | 'stopped';
	unsynced: Unsynced;
	/** While a file goes up. */
	upload?: { blobId: string; sent: number; total: number };
	stopped?: StopReason;
};

export type Runner = {
	/** Drains until nothing more can move. A call during a drain returns that drain. */
	drain(): Promise<DrainReport>;
	/** Ends the drain under way. What is in flight is checked by the next drain. */
	stop(): void;
	readonly running: boolean;
};

export type RunnerOptions = {
	port: OutboxPort;
	transport: Transport;
	env: RunnerEnv;
	policy?: Partial<Policy>;
	onProgress?: (progress: Progress) => void;
};

function kindOf(error: unknown): TransportErrorKind {
	return error instanceof TransportError ? error.kind : 'timeout';
}

/** Thrown through the loop to end the drain. */
class Halt {
	constructor(readonly reason: 'offline' | 'unauthorized') {}
}

function halt(kind: TransportErrorKind): void {
	if (kind === 'unreachable') throw new Halt('offline');
	if (kind === 'unauthorized') throw new Halt('unauthorized');
}

export function createRunner(options: RunnerOptions): Runner {
	const { port, transport, env } = options;
	const policy: Policy = { ...DEFAULT_POLICY, ...options.policy };
	let current: Promise<DrainReport> | undefined;
	let controller: AbortController | undefined;

	const jitter = () => env.random();
	const emit = (progress: Progress) => options.onProgress?.(progress);

	/** A transport call that ends as `timeout` when the drain is stopped or the call takes too long. */
	function call<T>(start: (signal: AbortSignal) => Promise<T>): Promise<T> {
		const signal = controller!.signal;
		return new Promise<T>((resolve, reject) => {
			const giveUp = () => reject(new TransportError('timeout'));
			if (signal.aborted) return giveUp();
			const cancel = env.timer?.(policy.callTimeoutMs, giveUp);
			const done = () => {
				cancel?.();
				signal.removeEventListener('abort', giveUp);
			};
			signal.addEventListener('abort', giveUp, { once: true });
			start(signal).then(
				(value) => (done(), resolve(value)),
				(error) => (done(), reject(error))
			);
		});
	}

	/** Checks the maybe-sent entries against the server and settles each. */
	async function check(entries: Entry[]): Promise<void> {
		const ids = entries.map((e) => e.id);
		const evidence = new Map<string, Evidence>();
		try {
			const lookups = entries.filter((e) => e.op.kind === 'create' || e.op.kind === 'delete');
			if (lookups.length) {
				const found = await call((s) => transport.lookup(lookups.map((e) => ({ table: e.op.table, id: e.op.recordId })), s));
				const byId = new Map(found.map((f) => [f.id, f.remoteId]));
				for (const e of lookups) evidence.set(e.id, byId.has(e.op.recordId) ? { found: byId.get(e.op.recordId)! } : {});
			}
			const updates = entries.filter((e) => e.op.kind === 'update');
			if (updates.length) {
				const server = await read(updates);
				for (const e of updates) evidence.set(e.id, server.has(e.op.recordId) ? { server: server.get(e.op.recordId)! } : {});
			}
			for (const e of entries) {
				if (e.op.kind !== 'blob') continue;
				const ref = await blobRef(e.op);
				evidence.set(e.id, await call((s) => transport.verifyUpload(ref, e.remoteId, s)));
			}
		} catch (error) {
			const kind = kindOf(error);
			halt(kind);
			await port.update((q) => deferCheck(q, ids, env.now(), policy, jitter()));
			return;
		}
		const now = env.now();
		await port.update((q) => entries.reduce((next, e) => settleCheck(next, e.id, judge(e, evidence.get(e.id) ?? {}), now, policy, jitter()), [...q]));
	}

	/** The server's values of the fields the update entries change, by record id. */
	async function read(updates: Entry[]): Promise<Map<string, Record<string, unknown>>> {
		const remote = await port.remoteIds(updates.map((e) => e.op.recordId));
		const requests = updates.map((e) => ({
			table: e.op.table,
			id: e.op.recordId,
			...(remote[e.op.recordId] !== undefined ? { remoteId: remote[e.op.recordId] } : {}),
			keys: e.op.kind === 'update' ? Object.keys(e.op.changes) : []
		}));
		const records = await call((s) => transport.read(requests, s));
		return new Map(records.map((r) => [r.id, r.fields]));
	}

	/** Sends one batch of record operations. */
	async function push(planned: Entry[]): Promise<void> {
		const ids = planned.map((e) => e.id);
		const updates = planned.filter((e) => e.op.kind === 'update');
		let server = new Map<string, Record<string, unknown>>();
		let readFailed = false;
		if (updates.length) {
			try {
				server = await read(updates);
			} catch (error) {
				halt(kindOf(error));
				readFailed = true;
			}
		}

		// One transaction: compare with the server, then mark what is still to go as in flight. An
		// edit made since the plan is already merged into the entries read here.
		let sending: Entry[] = [];
		await port.update((q) => {
			let next = [...q];
			if (readFailed) return markFailed(markInFlight(next, ids), ids, env.now(), policy, jitter());
			for (const e of updates) next = applyServerRead(next, e.id, server.get(e.op.recordId));
			const go = ids.filter((id) => next.some((e) => e.id === id && isOpen(e)));
			next = markInFlight(next, go);
			sending = next.filter((e) => go.includes(e.id));
			return next;
		});
		if (!sending.length) return;
		const sent = sending.map((e) => e.id);

		const remote = await port.remoteIds(sending.flatMap((e) => [e.op.recordId, ...e.dependsOn]));
		const ops: PushOp[] = sending.flatMap((e) => {
			if (e.op.kind === 'blob') return [];
			const links: Record<string, RemoteId> = {};
			for (const id of e.dependsOn) if (remote[id] !== undefined) links[id] = remote[id];
			const remoteId = remote[e.op.recordId];
			return [{ entryId: e.id, op: e.op, dependsOn: e.dependsOn, links, ...(e.op.kind !== 'create' && remoteId !== undefined ? { remoteId } : {}) }];
		});

		let result;
		try {
			result = await call((s) => transport.push(ops, s));
		} catch (error) {
			const kind = kindOf(error);
			const now = env.now();
			if (kind === 'unreachable' || kind === 'unauthorized') await port.update((q) => markUnsent(q, sent));
			else if (kind === 'timeout') await port.update((q) => markUnknown(q, sent, now, policy, jitter()));
			else await port.update((q) => markFailed(q, sent, now, policy, jitter()));
			halt(kind);
			return;
		}

		const now = env.now();
		if (result.outcome === 'applied') {
			const remoteIds = result.remoteIds;
			await port.update((q) => {
				let next = [...q];
				// A create with no server id in the answer is looked up rather than trusted.
				for (const e of sending) if (e.op.kind === 'create' && remoteIds[e.id] === undefined) next = markSent(next, e.id, now);
				return markApplied(
					next,
					sending.map((e) => ({ id: e.id, ...(remoteIds[e.id] !== undefined ? { remoteId: remoteIds[e.id] } : {}) }))
				);
			});
			return;
		}

		const refusals = result.refusals.filter((r) => sent.includes(r.entryId));
		await port.update((q) => {
			let next = [...q];
			if (!refusals.length) return markFailed(next, sent, now, policy, jitter());
			for (const r of refusals) {
				const kind = sending.find((e) => e.id === r.entryId)!.op.kind;
				// Refused as a duplicate: it was created before. The check looks it up by client UUID.
				if (r.reason === 'duplicate' && kind === 'create') next = markSent(next, r.entryId, now);
				else if (r.reason === 'gone' && kind === 'delete') next = markApplied(next, [{ id: r.entryId }]);
				else if (r.reason === 'gone') next = markAttention(next, r.entryId, { reason: 'gone' });
				else next = markAttention(next, r.entryId, { reason: 'refused', ...(r.message ? { message: r.message } : {}) });
			}
			// Nothing landed, and the rest was not at fault.
			return markUnsent(next, sent);
		});
	}

	async function blobRef(op: BlobOp): Promise<BlobRef> {
		const remote = await port.remoteIds([op.recordId]);
		const { kind: _k, ...ref } = op;
		return { ...ref, ...(remote[op.recordId] !== undefined ? { recordRemoteId: remote[op.recordId] } : {}) };
	}

	/** Uploads one file. It ends as sent, to be verified by the next check. */
	async function upload(entry: Entry, base: Unsynced): Promise<void> {
		const op = entry.op as BlobOp;
		const after = await port.update((q) => markInFlight(q, [entry.id]));
		if (!after.some((e) => e.id === entry.id && e.state === 'inFlight')) return;
		const data = await port.blob(op.blobId);
		if (!data) {
			await port.update((q) => markAttention(q, entry.id, { reason: 'blobMissing' }));
			return;
		}
		try {
			const ref = await blobRef(op);
			const remoteId = await sendFile(ref, data, (sent) =>
				emit({ phase: 'uploading', unsynced: base, upload: { blobId: op.blobId, sent, total: data.size } })
			);
			await port.update((q) => markSent(q, entry.id, env.now(), remoteId));
		} catch (error) {
			const kind = kindOf(error);
			const now = env.now();
			if (kind === 'unreachable' || kind === 'unauthorized') await port.update((q) => markUnsent(q, [entry.id]));
			else if (kind === 'timeout') await port.update((q) => markUnknown(q, [entry.id], now, policy, jitter()));
			else await port.update((q) => markFailed(q, [entry.id], now, policy, jitter()));
			halt(kind);
		}
	}

	/** Part by part. An expired URL is renewed; an upload that cannot be continued starts again. */
	async function sendFile(ref: BlobRef, data: Blob, onSent: (bytes: number) => void): Promise<RemoteId | undefined> {
		let session = await call((s) => transport.beginUpload(ref, s));
		let parts = planParts(data.size, session.partSize);
		let done: SentPart[] = [];
		let sentBytes = 0;
		let lastPartMs = 0;
		/** URLs that expired in a row with no part sent in between. */
		let stale = 0;

		const renew = async (): Promise<void> => {
			stale += 1;
			if (stale > policy.urlRenewals) throw new TransportError('failed', 'upload URLs keep expiring');
			try {
				session = await call((s) => transport.renewUpload(session, s));
			} catch (error) {
				if (kindOf(error) !== 'expired') throw error;
				session = await call((s) => transport.beginUpload(ref, s));
				parts = planParts(data.size, session.partSize);
				done = [];
				sentBytes = 0;
			}
		};

		for (;;) {
			const part = parts[done.length];
			try {
				if (!part) {
					const finished = await call((s) => transport.finishUpload(session, done, s));
					return finished.remoteId;
				}
				if (expiring(session.expiresAt, env.now(), partMargin(policy.urlMarginMs, lastPartMs))) {
					await renew();
					continue;
				}
				const started = env.now();
				done.push(await sendPart(session, part.index, data.slice(part.start, part.end, data.type)));
				lastPartMs = env.now() - started;
				sentBytes += part.end - part.start;
				stale = 0;
				onSent(sentBytes);
			} catch (error) {
				if (kindOf(error) !== 'expired') throw error;
				await renew();
			}
		}
	}

	async function sendPart(session: UploadSession, index: number, data: Blob): Promise<SentPart> {
		for (let tries = 1; ; tries++) {
			try {
				return await call((s) => transport.uploadPart(session, { index, data }, s));
			} catch (error) {
				if (kindOf(error) !== 'failed' || tries >= policy.partTries) throw error;
			}
		}
	}

	async function run(): Promise<DrainReport> {
		controller = new AbortController();
		const report = async (stopped: StopReason, waitUntil?: number): Promise<DrainReport> => {
			const count = unsynced(await port.entries());
			emit({ phase: 'stopped', unsynced: count, stopped });
			return { stopped, ...(waitUntil !== undefined ? { waitUntil } : {}), unsynced: count };
		};
		try {
			await port.update((q) => recover(q, env.now()));
			for (;;) {
				if (controller.signal.aborted || !env.visible()) return await report('hidden');
				if (!env.online()) return await report('offline');
				const queue = await port.entries();
				const plan = planBatch(queue, env.now(), policy);
				const count = unsynced(queue);
				if (plan.unconfirmed.length) {
					emit({ phase: 'checking', unsynced: count });
					await check(plan.unconfirmed);
				} else if (plan.ops.length) {
					emit({ phase: 'sending', unsynced: count });
					await push(plan.ops);
				} else if (plan.blob) {
					emit({ phase: 'uploading', unsynced: count, upload: { blobId: (plan.blob.op as BlobOp).blobId, sent: 0, total: (plan.blob.op as BlobOp).size } });
					await upload(plan.blob, count);
				} else {
					return await report(plan.waitUntil !== undefined ? 'waiting' : 'idle', plan.waitUntil);
				}
			}
		} catch (error) {
			if (error instanceof Halt) return await report(error.reason);
			throw error;
		}
	}

	return {
		drain() {
			current ??= run().finally(() => {
				current = undefined;
			});
			return current;
		},
		stop() {
			controller?.abort();
		},
		get running() {
			return current !== undefined;
		}
	};
}
