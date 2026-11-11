// What a new slate is called by default, whether a name is free, a blank slate and a copy. Pure.
//
// The suggestion, counted as the model counts take numbers (`nextTakeNumber`):
// 1. With a scene: the scene itself ("42") while the day has no slate of that name, then its
//    letters, after the highest the day has: 42 → 42A → 42B. A slate of the scene is the scene
//    followed by letters only, so "420" and "42X1" belong to other scenes.
// 2. Without: one after the day's last slate in counting order: 42A → 42B, 12 → 13; "1" on an
//    empty day.
// Either way the letters I and O are skipped (they read as 1 and 0 on a slate), and so is any
// name the day already has.

import { nextTakeNumber } from '$lib/model/take';
import type { Slate } from '$lib/model/types';
import { sortSlates } from '$lib/app/context';

const SKIPPED = /[IOio]$/;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `name`, or the first name after it that is neither I, O nor in use. */
function free(name: string, taken: (name: string) => boolean): string {
	let next = name;
	while (SKIPPED.test(next) || taken(next)) next = nextTakeNumber(next);
	return next;
}

export function nextSlateName(slates: readonly Slate[], scene?: string): string {
	const taken = (name: string) => slateNameTaken(slates, name);
	const sorted = sortSlates(slates);
	const wanted = scene?.trim() ?? '';
	if (wanted === '') {
		const last = (sorted[sorted.length - 1]?.slateUID ?? '').trim();
		return free(last === '' ? '1' : nextTakeNumber(last), taken);
	}
	const ofScene = new RegExp(`^${escape(wanted)}[A-Za-z]*$`, 'i');
	const mine = sorted.filter((s) => ofScene.test((s.slateUID ?? '').trim()));
	if (mine.length === 0) return wanted;
	const last = (mine[mine.length - 1].slateUID ?? '').trim();
	return free(last.toLowerCase() === wanted.toLowerCase() ? `${wanted}A` : nextTakeNumber(last), taken);
}

/** Whether the day already has a slate of that name, whatever the case and the spaces around it. `except`: the slate being renamed. */
export function slateNameTaken(slates: readonly Slate[], name: string, except?: string): boolean {
	const wanted = name.trim().toLowerCase();
	return slates.some((s) => s.id !== except && (s.slateUID ?? '').trim().toLowerCase() === wanted);
}

/** A blank slate on a shoot day. */
export function blankSlate(id: string, shootDayId: string, name: string): Slate {
	return { id, shootDayId, slateUID: name.trim() };
}

/** A copy of `slate` on the same day, under a new id and name. It keeps its template link. */
export function duplicateSlate(slate: Slate, id: string, name: string): Slate {
	return { ...structuredClone(slate), id, slateUID: name.trim() };
}
