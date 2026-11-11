// What the sync status says, and what the detail lists. Pure: from the outbox's counts, the
// queue and the sign-in state.

import type { AuthStatus } from '$lib/auth/state';
import type { Unsynced } from '$lib/outbox/select';
import type { Attention, FieldConflict, Op, Queue } from '$lib/outbox/types';

/**
 * - `attention`: something waits for a person. It wins over the rest.
 * - `pending`: changes wait and a session is there to send them.
 * - `local`: changes wait and nobody is signed in: they are on this device only.
 * - `synced`: nothing waits, signed in. `empty`: nothing waits, signed out.
 */
export type SyncState = 'attention' | 'pending' | 'local' | 'synced' | 'empty';

export interface SyncSummary {
	state: SyncState;
	/** What the state counts: entries that need a look, or entries waiting. */
	count: number;
	/** The status in full ("4 to sync") and in a word, as message keys; `{n}` is `count`. */
	key: `sync.${SyncState}`;
	shortKey: `sync.short.${SyncState}`;
}

export function syncSummary(unsynced: Pick<Unsynced, 'entries' | 'attention'> | undefined, status: AuthStatus): SyncSummary {
	const entries = unsynced?.entries ?? 0;
	const attention = unsynced?.attention ?? 0;
	const state: SyncState = attention > 0 ? 'attention' : entries > 0 ? (status === 'signed-in' ? 'pending' : 'local') : status === 'signed-in' ? 'synced' : 'empty';
	return { state, count: state === 'attention' ? attention : entries, key: `sync.${state}`, shortKey: `sync.short.${state}` };
}

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
