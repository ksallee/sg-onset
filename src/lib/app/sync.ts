// What the sync detail lists of the queue. Pure. The status is sync/status.ts.

import type { Attention, FieldConflict, Op, Queue } from '$lib/outbox/types';

/** What a person can do about an entry that needs a look. */
export type AttentionAction = 'retry' | 'mine' | 'theirs';

export interface AttentionRow {
	entryId: string;
	table: string;
	recordId: string;
	kind: Op['kind'];
	reason: Attention['reason'];
	/** The fields in conflict, when that is the reason. */
	conflicts: FieldConflict[];
	/** The server's words, when it refused. */
	message?: string;
	actions: AttentionAction[];
}

/** The entries of the queue that wait for a person, oldest first. */
export function attentionRows(queue: Queue): AttentionRow[] {
	return [...queue]
		.filter((e) => e.state === 'needsAttention' && e.attention)
		.sort((a, b) => a.seq - b.seq)
		.map((e) => {
			const attention = e.attention!;
			const conflict = attention.reason === 'conflict';
			return {
				entryId: e.id,
				table: e.op.table,
				recordId: e.op.recordId,
				kind: e.op.kind,
				reason: attention.reason,
				conflicts: conflict ? attention.conflicts : [],
				...(attention.reason === 'refused' && attention.message ? { message: attention.message } : {}),
				actions: conflict ? ['mine', 'theirs'] : ['retry']
			};
		});
}
