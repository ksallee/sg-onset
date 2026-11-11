// When a snapshot is due. Pure: time and the store's change counter are passed in.
//
// After changes, not on a timer alone: due when there are changes since the last snapshot and
// either `intervalMs` has passed since it or `maxChanges` piled up. Always when the page hides with
// changes. Never while one is being written. Before a risky operation the caller asks directly.

export type SnapshotPolicy = {
	/** Time since the last snapshot after which a change makes one due. */
	intervalMs: number;
	/** Changes since the last snapshot that make one due at once. */
	maxChanges: number;
	/** Records an edit must touch to count as risky: a template edit or a bulk edit. */
	riskyEditRecords: number;
	/** How long an idle callback may wait before the snapshot runs anyway. */
	idleTimeoutMs: number;
};

export const DEFAULT_SNAPSHOT_POLICY: SnapshotPolicy = {
	intervalMs: 10 * 60_000,
	maxChanges: 200,
	riskyEditRecords: 20,
	idleTimeoutMs: 2_000
};

/** The last snapshot as the policy sees it: when, and the change counter then. */
export type Last = { at: number; seq: number };

export type DueInput = {
	now: number;
	/** The store's change counter now. */
	seq: number;
	last: Last | undefined;
	/** A snapshot is being written. */
	writing: boolean;
	/** The page is being hidden. */
	hidden?: boolean;
};

export type Due = { due: false } | { due: true; reason: 'changes' | 'hidden' };

/** Changes since the last snapshot. A counter that went back (the store was replaced) counts as one. */
export function pendingChanges(seq: number, last: Last | undefined): number {
	if (!last) return seq;
	if (seq < last.seq) return 1;
	return seq - last.seq;
}

export function snapshotDue(input: DueInput, policy: SnapshotPolicy = DEFAULT_SNAPSHOT_POLICY): Due {
	if (input.writing) return { due: false };
	const pending = pendingChanges(input.seq, input.last);
	if (pending <= 0) return { due: false };
	if (input.hidden) return { due: true, reason: 'hidden' };
	const replaced = input.last !== undefined && input.seq < input.last.seq;
	if (!input.last || replaced || pending >= policy.maxChanges || input.now - input.last.at >= policy.intervalMs) {
		return { due: true, reason: 'changes' };
	}
	return { due: false };
}

/** When to look again if nothing else changes. Undefined: no changes wait. */
export function nextCheckAt(input: { seq: number; last: Last | undefined }, policy: SnapshotPolicy = DEFAULT_SNAPSHOT_POLICY): number | undefined {
	if (pendingChanges(input.seq, input.last) <= 0) return undefined;
	return input.last ? input.last.at + policy.intervalMs : 0;
}

/** Does an edit of `records` records call for a snapshot first. */
export function isRiskyEdit(records: number, policy: SnapshotPolicy = DEFAULT_SNAPSHOT_POLICY): boolean {
	return records >= policy.riskyEditRecords;
}
