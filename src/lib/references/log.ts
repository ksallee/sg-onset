// The reference log of a slate: its order, the name to suggest for the next one, a new reference,
// and the words a row, a file and Wrap show for it. Pure: ids, times and labels come in.

import type { Reference } from '$lib/model/types';
import { kindChoices } from './kinds';

/** In the order logged, then by id, so the order never depends on how the store returns them. */
export function sortReferences(refs: readonly Reference[]): Reference[] {
	return [...refs].sort((a, b) => (a.loggedAt ?? '').localeCompare(b.loggedAt ?? '') || a.id.localeCompare(b.id));
}

/**
 * The name to suggest after `last`: its last run of digits up by one, zeros kept, so an
 * extension after it stays. "HDRI_0412" → "HDRI_0413", "IMG_1234.DNG" → "IMG_1235.DNG". Nothing
 * when it holds no digits: a made-up name would be worse than none.
 */
export function nextReferenceName(last: string | undefined): string {
	const name = (last ?? '').trim();
	const match = /^(.*?)(\d+)(\D*)$/.exec(name);
	if (!match) return '';
	const [, head, digits, tail] = match;
	return head + String(BigInt(digits) + 1n).padStart(digits.length, '0') + tail;
}

/** The reference of `kind` logged last. */
export function lastOfKind(refs: readonly Reference[], kind: string): Reference | undefined {
	return sortReferences(refs.filter((r) => r.kind === kind)).at(-1);
}

/**
 * A new reference: its kind and name, logged at `loggedAt`, under the slate. The device and the
 * card or roll come from `last`, the last reference of that kind: the same camera and card, most
 * likely, as a new take copies the last. The count and the notes belong to one reference.
 */
export function newReference(id: string, slateId: string, kind: string, name: string, loggedAt: string, last?: Reference): Reference {
	const carried: Partial<Reference> = {};
	if (last?.device) carried.device = last.device;
	if (last?.cardOrRoll) carried.cardOrRoll = last.cardOrRoll;
	return { id, slateId, kind, name: name.trim(), ...carried, loggedAt };
}

const oneLine = (text: string) => text.replace(/\s*[\r\n\v]+\s*/g, ' ').trim();

/**
 * What a row shows under the name: the kind, device, card or roll and count. "HDRI 360 · Theta Z1 ·
 * A003 · ×3". `logged`, the words for where a lighting reference shown on another slate was logged
 * (#107), goes last: "· Logged on 12A".
 */
export function referenceDetail(ref: Reference, kindLabel: (kind: string) => string, logged?: string): string {
	return [kindLabel(ref.kind ?? ''), ref.device, ref.cardOrRoll, ref.count === undefined ? undefined : `×${ref.count}`, logged].filter(Boolean).join(' · ');
}

/** One reference in one line, for a file: "HDRI 360: HDRI_0412 (Theta Z1, A003, ×3, Noon sun)". */
export function referenceLine(ref: Reference, kindLabel: (kind: string) => string): string {
	const more = [ref.device, ref.cardOrRoll, ref.count === undefined ? undefined : `×${ref.count}`, ref.notes].filter((v): v is string => !!v && v.trim() !== '').map(oneLine);
	const head = `${kindLabel(ref.kind ?? '')}: ${oneLine(ref.name ?? '')}`;
	return more.length ? `${head} (${more.join(', ')})` : head;
}

/**
 * How many references of each kind, for Wrap: in the order of the choices, project kinds
 * included; a kind the project no longer lists after them. No kind counts as Other.
 */
export function countByKind(refs: readonly Reference[], projectKinds: readonly string[]): { kind: string; n: number }[] {
	const counts = new Map<string, number>();
	for (const r of refs) {
		const kind = (r.kind ?? '').trim() || 'other';
		counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}
	const order = kindChoices(projectKinds);
	const rank = (kind: string) => (order.includes(kind) ? order.indexOf(kind) : order.length);
	return [...counts].map(([kind, n]) => ({ kind, n })).sort((a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind));
}
