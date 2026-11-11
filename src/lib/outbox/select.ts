// What the UI shows about the queue. Pure.

import { isActive, type Queue } from './types';

export type Unsynced = {
	/** Entries the server has not confirmed, in any state. */
	entries: number;
	/** Distinct records they belong to. */
	records: number;
	/** Files among them. */
	blobs: number;
	/** Entries waiting for a person. */
	attention: number;
	/** When the oldest of them was queued. Absent on an empty queue. */
	oldest?: number;
};

export function unsynced(queue: Queue): Unsynced {
	const active = queue.filter(isActive);
	return {
		entries: active.length,
		records: new Set(active.map((e) => e.op.recordId)).size,
		blobs: active.filter((e) => e.op.kind === 'blob').length,
		attention: active.filter((e) => e.state === 'needsAttention').length,
		...(active.length ? { oldest: Math.min(...active.map((e) => e.createdAt)) } : {})
	};
}
