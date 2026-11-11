// What to do next with the queue: which unconfirmed entries to check, which record operations to
// send as one batch, which file to upload. Pure: the time is passed in.

import { levels } from './levels';
import { isOpen, type Entry, type Policy, type Queue } from './types';

export type Plan = {
	/** Maybe-sent entries due for a check. These go first. */
	unconfirmed: Entry[];
	/** Record operations of level 0, oldest first, at most `maxOps`. One batch. */
	ops: Entry[];
	/** The oldest file ready to upload. One at a time. */
	blob?: Entry;
	/** When the next scheduled retry or check falls due, if nothing is due sooner. */
	waitUntil?: number;
};

const due = (e: Entry, now: number) => (e.nextAttemptAt ?? 0) <= now;

export function planBatch(queue: Queue, now: number, policy: Pick<Policy, 'maxOps'>): Plan {
	const bySeq = [...queue].sort((a, b) => a.seq - b.seq);
	const level = levels(queue);
	const ready = bySeq.filter((e) => isOpen(e) && due(e, now) && level.get(e.id) === 0);
	const blob = ready.find((e) => e.op.kind === 'blob');
	const scheduled = bySeq
		.filter((e) => (e.state === 'failedRetryable' || e.state === 'sentUnconfirmed') && !due(e, now))
		.map((e) => e.nextAttemptAt!);
	return {
		unconfirmed: bySeq.filter((e) => e.state === 'sentUnconfirmed' && due(e, now)).slice(0, policy.maxOps),
		ops: ready.filter((e) => e.op.kind !== 'blob').slice(0, policy.maxOps),
		...(blob ? { blob } : {}),
		...(scheduled.length ? { waitUntil: Math.min(...scheduled) } : {})
	};
}
