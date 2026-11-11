// Camera setups (A, B, C, Second Unit): their order, their labels, and which gear the pickers
// put first. Pure.
//
// A setup holds a body and a lens for the takes to come. A take holds its own `cameraId` and
// `lensId` (model decision 2): changing a setup never rewrites a take already shot.

import type { CameraSetup, Take } from '$lib/model/types';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const isLetter = (label: string) => /^\p{L}$/u.test(label.trim());

/** The rule with no order set: single letters first (A, B, C), then names, each alphabetical. */
function byRule(a: CameraSetup, b: CameraSetup): number {
	const la = (a.cameraLabel ?? '').trim();
	const lb = (b.cameraLabel ?? '').trim();
	return Number(!isLetter(la)) - Number(!isLetter(lb)) || collator.compare(la, lb);
}

const hasOrder = (s: CameraSetup) => typeof s.order === 'number' && Number.isFinite(s.order);

/**
 * The order of camera setups everywhere: Gear, the take screen, the pickers. Setups with an order
 * set by hand first, by that order; then the rest by the rule (single letters first, then names
 * such as Drone or Second Unit, each in alphabetical order). A tie goes by the rule.
 */
export function sortSetups(setups: readonly CameraSetup[]): CameraSetup[] {
	return [...setups].sort((a, b) => {
		const oa = hasOrder(a);
		const ob = hasOrder(b);
		if (oa !== ob) return oa ? -1 : 1;
		return (oa ? a.order! - b.order! : 0) || byRule(a, b);
	});
}

/**
 * The order to save after moving setup `id` to index `to` of the sorted list: every setup
 * numbered from 1 in the new order, listed only where its order changes. Empty for no move.
 */
export function moveSetup(setups: readonly CameraSetup[], id: string, to: number): { setup: CameraSetup; order: number }[] {
	const sorted = sortSetups(setups);
	const from = sorted.findIndex((s) => s.id === id);
	if (from < 0 || from === Math.max(0, Math.min(to, sorted.length - 1))) return [];
	const [moving] = sorted.splice(from, 1);
	sorted.splice(Math.max(0, Math.min(to, sorted.length)), 0, moving);
	return sorted.map((setup, i) => ({ setup, order: i + 1 })).filter((c) => c.setup.order !== c.order);
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The first letter no setup has. Empty when all 26 are taken. */
export function nextSetupLabel(setups: readonly CameraSetup[]): string {
	const taken = new Set(setups.map((s) => (s.cameraLabel ?? '').trim().toUpperCase()));
	return [...LETTERS].find((l) => !taken.has(l)) ?? '';
}

/** Whether another setup has that label, whatever the case and the spaces around. */
export function setupLabelTaken(setups: readonly CameraSetup[], label: string, exceptId?: string): boolean {
	const wanted = label.trim().toLowerCase();
	return setups.some((s) => s.id !== exceptId && (s.cameraLabel ?? '').trim().toLowerCase() === wanted);
}

export function blankSetup(id: string, projectId: string, label: string): CameraSetup {
	return { id, projectId, cameraLabel: label.trim() };
}

/** The setups that hold this body or this lens. */
export function setupsUsing(setups: readonly CameraSetup[], key: 'cameraId' | 'lensId', id: string): CameraSetup[] {
	return setups.filter((s) => s[key] === id);
}

/**
 * Gear ids, most recent first: `picks` (chosen in a picker this session, newest first), then the
 * gear of the takes, latest start first. No repeats.
 */
export function recentIds(takes: readonly Take[], key: 'cameraId' | 'lensId', picks: readonly string[]): string[] {
	const shot = takes
		.filter((t) => t.startedAt && t[key])
		.sort((a, b) => (a.startedAt! < b.startedAt! ? 1 : a.startedAt! > b.startedAt! ? -1 : 0))
		.map((t) => t[key]!);
	return [...new Set([...picks, ...shot])];
}

/**
 * A picker's two groups: up to `cap` recent items on top, in recent order, and the rest in the
 * order given. No recent group when it would hold every item: it would only repeat the list.
 */
export function pickerList<T extends { id: string }>(items: readonly T[], recent: readonly string[], cap: number): { recent: T[]; rest: T[] } {
	const byId = new Map(items.map((i) => [i.id, i]));
	const top = recent
		.map((id) => byId.get(id))
		.filter((i): i is T => i !== undefined)
		.slice(0, cap);
	if (top.length === 0 || top.length >= items.length) return { recent: [], rest: [...items] };
	const ids = new Set(top.map((i) => i.id));
	return { recent: top, rest: items.filter((i) => !ids.has(i.id)) };
}

/** A pick put first in a list of recent picks, no repeats, at most eight. */
export function pushPick(list: readonly string[], id: string, cap = 8): string[] {
	return [id, ...list.filter((x) => x !== id)].slice(0, cap);
}
