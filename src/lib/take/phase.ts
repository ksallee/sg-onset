// Where a take stands, from its stored start and end times alone: Ready, Running, Ended. Nothing
// is kept in memory, so a reload shows the same state. Pure.

import type { TakeGroup } from './groups';
import type { Phase } from './record';

export type { Phase };

/** A time as the model stores it, to the second (FPT keeps seconds): 2026-11-11T09:41:07Z. */
export function stamp(ms: number): string {
	return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

const started = (group: TakeGroup) => group.takes.filter((t) => t.startedAt !== undefined);

/**
 * Ready (`idle`) before any camera started. Running (`rolling`) while a camera that started has no
 * end. Ended (`filed`) once every camera that started has an end. A camera that never started
 * does not hold a take open.
 */
export function groupPhase(group: TakeGroup): Phase {
	const on = started(group);
	if (on.length === 0) return 'idle';
	return on.some((t) => t.endedAt === undefined) ? 'rolling' : 'filed';
}

/** The first start and, once ended, the last end, epoch ms. */
export function groupTimes(group: TakeGroup): { start: number | null; end: number | null } {
	const on = started(group);
	if (on.length === 0) return { start: null, end: null };
	const start = Math.min(...on.map((t) => Date.parse(t.startedAt!)));
	if (groupPhase(group) !== 'filed') return { start, end: null };
	return { start, end: Math.max(...on.map((t) => Date.parse(t.endedAt!))) };
}

/** The take number that is running, the last if more than one is. */
export function runningGroup(groups: readonly TakeGroup[]): TakeGroup | undefined {
	return groups.findLast((g) => groupPhase(g) === 'rolling');
}
