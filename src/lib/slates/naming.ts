// What a new slate is called by default, and whether a name is free. Pure.

import { nextTakeNumber } from '$lib/model/take';
import type { Slate } from '$lib/model/types';
import { sortSlates } from '$lib/app/context';

/** The name after the last slate of the day, counted as a take number is: 42A → 42B, 12 → 13. "1" on an empty day. */
export function nextSlateName(slates: readonly Slate[]): string {
	const sorted = sortSlates(slates);
	return nextTakeNumber(sorted[sorted.length - 1]?.slateUID ?? '');
}

/** Whether the day already has a slate of that name, whatever the case and the spaces around it. */
export function slateNameTaken(slates: readonly Slate[], name: string): boolean {
	const wanted = name.trim().toLowerCase();
	return slates.some((s) => (s.slateUID ?? '').trim().toLowerCase() === wanted);
}

/** A blank slate on a shoot day. */
export function blankSlate(id: string, shootDayId: string, name: string): Slate {
	return { id, shootDayId, slateUID: name.trim() };
}
