// The slates list: the shoot days of a project, each with its slates and how many takes each
// has. The current day comes first. Pure.

import type { ShootDay, Slate, Take } from '$lib/model/types';
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
