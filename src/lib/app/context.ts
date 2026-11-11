// The place the person is working in: a project, one of its shoot days, one of that day's
// slates. Which one is current, and the order lists show them in. Pure; context.svelte.ts reads
// the store and the settings.

import type { Project, ShootDay, Slate } from '$lib/model/types';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** By name. */
export function sortProjects(projects: readonly Project[]): Project[] {
	return [...projects].sort((a, b) => collator.compare(a.name ?? '', b.name ?? ''));
}

/** Newest first: by date, then by day number. */
export function sortShootDays(days: readonly ShootDay[]): ShootDay[] {
	return [...days].sort((a, b) => (b.shootDate ?? '').localeCompare(a.shootDate ?? '') || (b.shootDay ?? 0) - (a.shootDay ?? 0));
}

/** As a person counts: 9 before 10, 42A before 42B. */
export function sortSlates(slates: readonly Slate[]): Slate[] {
	return [...slates].sort((a, b) => collator.compare(a.slateUID ?? '', b.slateUID ?? ''));
}

/** The record with `id`; when there is none, the first of `rows`: the list is sorted, so its head is the natural pick. */
export function pickCurrent<T extends { id: string }>(rows: readonly T[], id: string | undefined): T | undefined {
	return rows.find((r) => r.id === id) ?? rows[0];
}

/** The record with `id`, and no other: a slate is never picked for the person. */
export function pickExact<T extends { id: string }>(rows: readonly T[], id: string | undefined): T | undefined {
	return id === undefined ? undefined : rows.find((r) => r.id === id);
}

/** The number of the next shoot day: one past the highest. */
export function nextDayNumber(days: readonly ShootDay[]): number {
	return Math.max(0, ...days.map((d) => d.shootDay ?? 0)) + 1;
}

/** What a shoot day is called, as a message: "Day 3", or "Shoot day" when it has no number. */
export function dayName(day: Pick<ShootDay, 'shootDay'>): { key: 'context.day' | 'context.day.unnumbered'; params: { n: number } } {
	return day.shootDay === undefined ? { key: 'context.day.unnumbered', params: { n: 0 } } : { key: 'context.day', params: { n: day.shootDay } };
}
