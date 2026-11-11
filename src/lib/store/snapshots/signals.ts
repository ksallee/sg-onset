// What the UI says about the safety of the data. Pure: the facts and the time are passed in.
//
// Snapshots guard against mistakes and bugs, on this device. Only an off-device copy guards
// against losing the device or its storage: a full sync to Flow PT, or a backup zip the user
// exported. So the signal that matters most is how long entries have existed only here.

import { pendingChanges, type Last } from './policy';

export type Severity = 'ok' | 'remind' | 'warn';

/**
 * - `localOnlyDay`: entries have existed only on this device for over `warnAfterMs`. Warn.
 * - `localOnly`: for over `remindAfterMs`.
 * - `snapshotStale`: changes have waited over `snapshotStaleMs` for a snapshot: they are not running.
 * - `snapshotBad`: the newest snapshot failed its check.
 * - `overBudget`: the snapshots kept are over their size budget.
 * - `notPersisted`: the browser has not promised to keep the data, and some exists only here.
 */
export type SignalReason = 'localOnlyDay' | 'localOnly' | 'snapshotStale' | 'snapshotBad' | 'overBudget' | 'notPersisted';

export type Thresholds = {
	remindAfterMs: number;
	warnAfterMs: number;
	snapshotStaleMs: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
	remindAfterMs: 4 * 3600_000,
	warnAfterMs: 24 * 3600_000,
	snapshotStaleMs: 3600_000
};

export type OffDevice = {
	/** The last time the queue was found empty after a drain: everything on Flow PT. */
	sync?: number;
	/** The last time the user exported a backup zip. */
	export?: number;
	/** The store's change counter at that export. */
	exportSeq?: number;
};

export type SignalInput = {
	/** The store's change counter now. */
	seq: number;
	/** The newest good snapshot. */
	lastSnapshot: Last | undefined;
	/** The newest snapshot failed its check. */
	newestBad?: boolean;
	overBudget?: boolean;
	offDevice: OffDevice;
	/** The queue: changes Flow PT does not have. `unsynced()` gives it. */
	queue: { entries: number; records: number; oldest?: number };
	persisted: boolean;
};

export type BackupSignals = {
	severity: Severity;
	/** Most severe first. */
	reasons: SignalReason[];
	sinceSnapshotMs?: number;
	lastOffDevice?: { kind: 'sync' | 'export'; at: number };
	sinceOffDeviceMs?: number;
	/** Entries with changes that exist only on this device, and how long the oldest has. */
	localOnly: { records: number; entries: number; sinceMs?: number };
	/** Changes not in a snapshot yet. */
	pendingChanges: number;
};

const ORDER: SignalReason[] = ['localOnlyDay', 'localOnly', 'snapshotStale', 'snapshotBad', 'overBudget', 'notPersisted'];

export function backupSignals(input: SignalInput, now: number, thresholds: Thresholds = DEFAULT_THRESHOLDS): BackupSignals {
	const { offDevice, queue } = input;
	const lastOffDevice =
		offDevice.export !== undefined && (offDevice.sync === undefined || offDevice.export > offDevice.sync)
			? { kind: 'export' as const, at: offDevice.export }
			: offDevice.sync !== undefined
				? { kind: 'sync' as const, at: offDevice.sync }
				: undefined;

	// An export holds every change made before it. With no change since, nothing is only here.
	const exportCovers = offDevice.export !== undefined && offDevice.exportSeq !== undefined && offDevice.exportSeq >= input.seq;
	const localOnly: BackupSignals['localOnly'] =
		queue.entries === 0 || exportCovers
			? { records: 0, entries: 0 }
			: {
					records: queue.records,
					entries: queue.entries,
					...(queue.oldest !== undefined ? { sinceMs: now - Math.max(queue.oldest, offDevice.export ?? -Infinity) } : {})
				};

	const pending = pendingChanges(input.seq, input.lastSnapshot);
	const reasons = new Set<SignalReason>();
	const exposed = localOnly.sinceMs ?? 0;
	if (localOnly.entries && exposed >= thresholds.warnAfterMs) reasons.add('localOnlyDay');
	else if (localOnly.entries && exposed >= thresholds.remindAfterMs) reasons.add('localOnly');
	const waited = input.lastSnapshot ? (pending > 0 ? now - input.lastSnapshot.at : 0) : queue.oldest !== undefined ? now - queue.oldest : 0;
	if (waited >= thresholds.snapshotStaleMs) reasons.add('snapshotStale');
	if (input.newestBad) reasons.add('snapshotBad');
	if (input.overBudget) reasons.add('overBudget');
	if (!input.persisted && localOnly.entries) reasons.add('notPersisted');

	const sorted = ORDER.filter((r) => reasons.has(r));
	return {
		severity: reasons.has('localOnlyDay') ? 'warn' : sorted.length ? 'remind' : 'ok',
		reasons: sorted,
		...(input.lastSnapshot ? { sinceSnapshotMs: now - input.lastSnapshot.at } : {}),
		...(lastOffDevice ? { lastOffDevice, sinceOffDeviceMs: now - lastOffDevice.at } : {}),
		localOnly,
		pendingChanges: pending
	};
}
