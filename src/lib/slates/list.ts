// The slates list: the shoot days of a project, each with its slates and how many takes each
// has; and the current day's slates summed up for the list beside the detail (takes, time,
// marks, unsynced), sorted and filtered. Pure.

import type { ShootDay, Slate, Take } from '$lib/model/types';
import { isActive, type Entry } from '$lib/outbox/types';
import { sortShootDays, sortSlates } from '$lib/app/context';

export interface SlateRow {
	slate: Slate;
	takes: number;
}

export interface DayGroup {
	day: ShootDay;
	current: boolean;
	slates: SlateRow[];
}

export function slatesByDay(days: readonly ShootDay[], slates: readonly Slate[], takes: readonly Pick<Take, 'slateId'>[], currentDayId?: string): DayGroup[] {
	const count = new Map<string, number>();
	for (const take of takes) count.set(take.slateId, (count.get(take.slateId) ?? 0) + 1);
	const groups = sortShootDays(days).map((day) => ({
		day,
		current: day.id === currentDayId,
		slates: sortSlates(slates.filter((s) => s.shootDayId === day.id)).map((slate) => ({ slate, takes: count.get(slate.id) ?? 0 }))
	}));
	return [...groups.filter((g) => g.current), ...groups.filter((g) => !g.current)];
}

/** How many takes, as a message: none, one, many. */
export function takeCount(n: number): { key: 'slates.takes.none' | 'slates.takes.one' | 'slates.takes.many'; params: { n: number } } {
	return { key: n === 0 ? 'slates.takes.none' : n === 1 ? 'slates.takes.one' : 'slates.takes.many', params: { n } };
}

/** A slate as the list shows it. A take is one camera's take (model decision 1): each counts. */
export interface SlateSummary {
	slate: Slate;
	takes: number;
	circled: number;
	noGood: number;
	/** The first start time of its takes. */
	start?: string;
	/** The last end time of its takes; a take with no end counts by its start. */
	end?: string;
	/** The slate or one of its takes has a change not yet confirmed by the server. */
	unsynced: boolean;
}

export function summarise(slates: readonly Slate[], takes: readonly Take[], unsynced: ReadonlySet<string>): SlateSummary[] {
	const bySlate = new Map<string, Take[]>();
	for (const take of takes) bySlate.set(take.slateId, [...(bySlate.get(take.slateId) ?? []), take]);
	return slates.map((slate) => {
		const own = bySlate.get(slate.id) ?? [];
		const starts = own.flatMap((t) => (t.startedAt ? [t.startedAt] : [])).sort();
		const ends = own.flatMap((t) => (t.endedAt ?? t.startedAt ? [(t.endedAt ?? t.startedAt)!] : [])).sort();
		return {
			slate,
			takes: own.length,
			circled: own.filter((t) => t.circleTake).length,
			noGood: own.filter((t) => t.noGood).length,
			...(starts.length ? { start: starts[0] } : {}),
			...(ends.length ? { end: ends[ends.length - 1] } : {}),
			unsynced: unsynced.has(slate.id)
		};
	});
}

export type SlateSort = 'slate' | 'time' | 'scene';
export const SLATE_SORTS: readonly SlateSort[] = ['slate', 'time', 'scene'];

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * `slate`: as a person counts. `time`: by the first take, slates never shot last. `scene`: by
 * scene, then slate. Ties fall back to counting order.
 */
export function sortSlateRows(rows: readonly SlateSummary[], by: SlateSort): SlateSummary[] {
	const name = (a: SlateSummary, b: SlateSummary) => collator.compare(a.slate.slateUID ?? '', b.slate.slateUID ?? '');
	const compare: Record<SlateSort, (a: SlateSummary, b: SlateSummary) => number> = {
		slate: name,
		time: (a, b) => (a.start ?? '￿').localeCompare(b.start ?? '￿') || name(a, b),
		scene: (a, b) => collator.compare(a.slate.sceneNumber ?? '', b.slate.sceneNumber ?? '') || name(a, b)
	};
	return [...rows].sort(compare[by]);
}

export type SlateFilter = { scene?: string; noGood?: boolean; unsynced?: boolean };

/** The rows that pass every filter that is set. */
export function filterSlates(rows: readonly SlateSummary[], filter: SlateFilter): SlateSummary[] {
	return rows.filter(
		(r) =>
			(filter.scene === undefined || (r.slate.sceneNumber ?? '').trim() === filter.scene) &&
			(!filter.noGood || r.noGood > 0) &&
			(!filter.unsynced || r.unsynced)
	);
}

/** The scenes of the slates, once each, as a person counts. */
export function sceneOptions(slates: readonly Slate[]): string[] {
	const scenes = new Set(slates.map((s) => (s.sceneNumber ?? '').trim()).filter((s) => s !== ''));
	return [...scenes].sort(collator.compare);
}

/** The slates with a change the server has not confirmed: their own, or one of their takes'. */
export function unsyncedSlateIds(entries: readonly Entry[], takes: readonly Take[]): Set<string> {
	const slateOf = new Map(takes.map((t) => [t.id, t.slateId]));
	const out = new Set<string>();
	for (const entry of entries) {
		if (!isActive(entry)) continue;
		const { table, recordId } = entry.op;
		if (table === 'slate') out.add(recordId);
		else if (table === 'take' && slateOf.has(recordId)) out.add(slateOf.get(recordId)!);
	}
	return out;
}
