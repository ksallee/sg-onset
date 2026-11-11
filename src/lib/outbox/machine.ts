// The state machine of an entry. Each function returns the queue with some entries moved; an entry
// that is not in a state the move starts from is left as it is, so a stale id does no harm. Pure.
//
//   pending ─────────────┐
//   failedRetryable ─────┴─> inFlight ──> confirmed
//                              │ ├──────> sentUnconfirmed ──> confirmed
//                              │ │                 └────────> failedRetryable / needsAttention
//                              │ ├──────> failedRetryable     (the server did not take it)
//                              │ ├──────> pending             (it never left)
//                              │ └──────> needsAttention      (refused, gone, out of attempts)
//   needsAttention ──> pending                                (a person retried or chose)
//   pending / failedRetryable ──> confirmed / needsAttention  (the read before sending: the
//                                                              server has it already / conflict)

import { backoffMs, exhausted } from './backoff';
import type { Attention, Entry, EntryState, Policy, Queue, RemoteId } from './types';

type Timing = Pick<Policy, 'baseMs' | 'factor' | 'maxMs' | 'maxAttempts'>;

const MOVES: Record<EntryState, readonly EntryState[]> = {
	pending: ['inFlight', 'confirmed', 'needsAttention'],
	failedRetryable: ['inFlight', 'confirmed', 'needsAttention'],
	inFlight: ['pending', 'sentUnconfirmed', 'confirmed', 'failedRetryable', 'needsAttention'],
	sentUnconfirmed: ['confirmed', 'failedRetryable', 'needsAttention'],
	needsAttention: ['pending'],
	confirmed: []
};

export function canMove(from: EntryState, to: EntryState): boolean {
	return MOVES[from].includes(to);
}

/** `entry` without the keys that belong to a state it has left. */
function clean(entry: Entry): Omit<Entry, 'nextAttemptAt' | 'attention'> {
	const { nextAttemptAt: _n, attention: _a, ...rest } = entry;
	return rest;
}

function move(queue: Queue, ids: readonly string[], from: readonly EntryState[], to: (e: Entry) => Entry): Entry[] {
	const wanted = new Set(ids);
	return queue.map((e) => (wanted.has(e.id) && from.includes(e.state) ? to(e) : e));
}

function failed(e: Entry, now: number, policy: Timing, jitter: number): Entry {
	if (exhausted(e.attempts, policy)) return { ...clean(e), state: 'needsAttention', attention: { reason: 'attempts' } };
	return { ...clean(e), state: 'failedRetryable', nextAttemptAt: now + backoffMs(e.attempts, policy, jitter) };
}

/** An attempt starts. Write this before the request leaves. */
export function markInFlight(queue: Queue, ids: readonly string[]): Entry[] {
	return move(queue, ids, ['pending', 'failedRetryable'], (e) => ({ ...clean(e), state: 'inFlight', attempts: e.attempts + 1 }));
}

/** The server took them. */
export function markApplied(queue: Queue, results: readonly { id: string; remoteId?: RemoteId }[]): Entry[] {
	const remote = new Map(results.map((r) => [r.id, r.remoteId]));
	return move(queue, [...remote.keys()], ['inFlight'], (e) => {
		const remoteId = remote.get(e.id) ?? e.remoteId;
		return { ...clean(e), state: 'confirmed', ...(remoteId !== undefined ? { remoteId } : {}) };
	});
}

/** No answer: the attempt may have landed. Checked after a delay, never resent blind. */
export function markUnknown(queue: Queue, ids: readonly string[], now: number, policy: Timing, jitter: number): Entry[] {
	return move(queue, ids, ['inFlight'], (e) => ({
		...clean(e),
		state: 'sentUnconfirmed',
		nextAttemptAt: now + backoffMs(e.attempts, policy, jitter)
	}));
}

/** Sent, and to be checked now: an upload that finished, or a create the server called a duplicate. */
export function markSent(queue: Queue, id: string, now: number, remoteId?: RemoteId): Entry[] {
	return move(queue, [id], ['inFlight'], (e) => ({
		...clean(e),
		state: 'sentUnconfirmed',
		nextAttemptAt: now,
		...(remoteId !== undefined ? { remoteId } : {})
	}));
}

/** The server did not take them. Retried later, or handed to a person when the attempts run out. */
export function markFailed(queue: Queue, ids: readonly string[], now: number, policy: Timing, jitter: number): Entry[] {
	return move(queue, ids, ['inFlight'], (e) => failed(e, now, policy, jitter));
}

/** The attempt never left the device: no network, or no session. It does not count. */
export function markUnsent(queue: Queue, ids: readonly string[]): Entry[] {
	return move(queue, ids, ['inFlight'], (e) => ({ ...clean(e), state: 'pending', attempts: Math.max(0, e.attempts - 1) }));
}

/** Only a person can move it on. */
export function markAttention(queue: Queue, id: string, attention: Attention): Entry[] {
	return move(queue, [id], ['pending', 'failedRetryable', 'inFlight', 'sentUnconfirmed'], (e) => ({
		...clean(e),
		state: 'needsAttention',
		attention
	}));
}

/** After a crash or a kill: what was in flight may have landed. Check it now. */
export function recover(queue: Queue, now: number): Entry[] {
	return queue.map((e) => (e.state === 'inFlight' ? { ...clean(e), state: 'sentUnconfirmed', nextAttemptAt: now } : e));
}

/** The answer to "did it land": confirm it, or schedule the resend. See recovery.ts for the evidence. */
export function settleCheck(
	queue: Queue,
	id: string,
	verdict: { applied: boolean; remoteId?: RemoteId },
	now: number,
	policy: Timing,
	jitter: number
): Entry[] {
	return move(queue, [id], ['sentUnconfirmed'], (e) => {
		if (!verdict.applied) {
			const { remoteId: _r, ...rest } = e;
			return failed(rest, now, policy, jitter);
		}
		const remoteId = verdict.remoteId ?? e.remoteId;
		return { ...clean(e), state: 'confirmed', ...(remoteId !== undefined ? { remoteId } : {}) };
	});
}

/** The check itself could not be made. Try it later; no attempt is counted. */
export function deferCheck(queue: Queue, ids: readonly string[], now: number, policy: Timing, jitter: number): Entry[] {
	return move(queue, ids, ['sentUnconfirmed'], (e) => ({
		...e,
		nextAttemptAt: now + backoffMs(Math.max(1, e.attempts), policy, jitter)
	}));
}

/** A person says: try again. A conflict is not released this way: see `resolveConflict`. */
export function retry(queue: Queue, id: string): Entry[] {
	return queue.map((e) =>
		e.id === id && e.state === 'needsAttention' && e.attention?.reason !== 'conflict'
			? { ...clean(e), state: 'pending', attempts: 0 }
			: e
	);
}

/** The queue without what the server has confirmed. */
export function prune(queue: Queue): Entry[] {
	return queue.filter((e) => e.state !== 'confirmed');
}
