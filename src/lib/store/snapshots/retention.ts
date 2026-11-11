// Which snapshots to keep. Pure: time and the budget are passed in.
//
// Kept: the newest good snapshot, always; the last `autoCount` automatic ones; the newest of each
// of the last `dailyDays` days (in the device's time zone); every risky one younger than
// `riskyMs`. Bad snapshots go. Over the size budget, the oldest dailies go first, then the oldest
// risky ones, then the oldest automatic ones. The newest good one never goes: if it alone is over
// the budget, that is reported.

import type { SnapshotKind } from './types';

export type RetentionPolicy = {
	autoCount: number;
	dailyDays: number;
	riskyMs: number;
	/** Share of the quota the snapshots may use. */
	quotaShare: number;
	/** Share of the free space they may use. */
	freeShare: number;
	/** The budget when the browser gives no estimate. */
	fallbackBudgetBytes: number;
};

export const DEFAULT_RETENTION: RetentionPolicy = {
	autoCount: 3,
	dailyDays: 7,
	riskyMs: 48 * 3600_000,
	quotaShare: 0.05,
	freeShare: 0.25,
	fallbackBudgetBytes: 100 * 1024 * 1024
};

/** A snapshot as retention sees it. */
export type Kept = { id: string; at: number; kind: SnapshotKind; size: number; bad?: boolean };

export type Retained = {
	keep: string[];
	drop: string[];
	/** Bytes of what is kept. */
	bytes: number;
	/** What is kept is over the budget and nothing more may go. */
	overBudget: boolean;
};

const DAY = 24 * 3600_000;

/** The size budget from the storage estimate: a share of the quota, at most a share of what is free. */
export function budgetBytes(estimate: { quota?: number; free?: number }, policy: RetentionPolicy = DEFAULT_RETENTION): number {
	const limits = [
		...(estimate.quota !== undefined ? [estimate.quota * policy.quotaShare] : []),
		...(estimate.free !== undefined ? [estimate.free * policy.freeShare] : [])
	];
	return limits.length ? Math.floor(Math.min(...limits)) : policy.fallbackBudgetBytes;
}

export function retain(
	snapshots: readonly Kept[],
	options: { now: number; budgetBytes?: number; tzOffsetMs?: number },
	policy: RetentionPolicy = DEFAULT_RETENTION
): Retained {
	const { now, tzOffsetMs = 0 } = options;
	const day = (t: number) => Math.floor((t + tzOffsetMs) / DAY);
	const newestFirst = [...snapshots].sort((a, b) => b.at - a.at);
	const good = newestFirst.filter((s) => !s.bad);
	const newest = good[0];

	const autos = new Set(good.filter((s) => s.kind === 'auto').slice(0, policy.autoCount));
	const risky = new Set(good.filter((s) => s.kind === 'risky' && now - s.at < policy.riskyMs));
	const dailies = new Set<Kept>();
	const seenDays = new Set<number>();
	for (const s of good) {
		const age = day(now) - day(s.at);
		if (age < 0 || age >= policy.dailyDays || seenDays.has(age)) continue;
		seenDays.add(age);
		dailies.add(s);
	}

	const kept = new Set<Kept>([...autos, ...risky, ...dailies, ...(newest ? [newest] : [])]);
	let bytes = [...kept].reduce((sum, s) => sum + s.size, 0);
	const budget = options.budgetBytes ?? Infinity;

	// Over budget: oldest dailies first, then risky, then automatic. Never the newest good one.
	const oldestFirst = [...kept].sort((a, b) => a.at - b.at).filter((s) => s !== newest);
	const rounds = [
		oldestFirst.filter((s) => !autos.has(s) && !risky.has(s)),
		oldestFirst.filter((s) => !autos.has(s) && risky.has(s)),
		oldestFirst.filter((s) => autos.has(s))
	];
	for (const round of rounds) {
		for (const s of round) {
			if (bytes <= budget) break;
			kept.delete(s);
			bytes -= s.size;
		}
	}

	return {
		keep: newestFirst.filter((s) => kept.has(s)).map((s) => s.id),
		drop: newestFirst.filter((s) => !kept.has(s)).map((s) => s.id),
		bytes,
		overBudget: bytes > budget
	};
}
