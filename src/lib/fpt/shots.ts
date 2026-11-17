// A slate's link to its Shots: the VFX shot codes typed on the slate, matched to the Shots of the
// Flow PT project, and the writes that bring the slate's Shots field in line. Pure: the search and
// the writes are in transport.ts.
//
// From the corpus:
// - Shot `code` is text, not unique, and every read needs a project filter of its own: the
//   endpoint is not scoped (findings/entity_types/Shot.md).
// - Text matching is case-blind and strips outer spaces, `is` and `in` alike
//   (findings/field_types/text.md). A code is matched the same way here.
// - A multi_entity field takes `{multi_entity_update_mode: add | remove, value}` in the body to add
//   or remove in place. A bare list replaces the whole set, and would drop a link someone made
//   from the Shot's side (recipes/009_multi_entity_safely.md, findings/142_reverse_field.md).

import type { Op } from '$lib/outbox/types';
import type { Filter } from './api';

/** The entity the codes name. Built in: it is never ours to create. */
export const SHOT = 'Shot';

/** The slate key that holds the codes. */
export const SHOT_CODES_KEY = 'vfxShots';

export type ShotRow = { id: number; code: string };

/** What to write to one slate's Shots field, and the codes no Shot has. */
export type ShotLink = { add: number[]; remove: number[]; waiting: string[] };

/** A code as Flow PT matches it: trimmed, whatever the case. */
export function codeKey(code: string): string {
	return code.trim().toLowerCase();
}

/** The codes of a slate's value, each once, in the order typed. */
export function shotCodes(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of value) {
		if (typeof item !== 'string' || !item.trim() || seen.has(codeKey(item))) continue;
		seen.add(codeKey(item));
		out.push(item.trim());
	}
	return out;
}

/** The search for the Shots of the project with these codes. */
export function shotFilter(projectId: number, codes: readonly string[]): Filter {
	return {
		logical_operator: 'and',
		conditions: [
			['project', 'is', { type: 'Project', id: projectId }],
			['code', 'in', [...codes]]
		]
	};
}

type Row = { type?: string; id: number; attributes?: Record<string, unknown> };

/** The Shots of a search answer that have a code. */
export function shotsOf(rows: readonly Row[]): ShotRow[] {
	return rows.flatMap((row) => {
		const code = row.attributes?.code;
		return typeof code === 'string' && code.trim() ? [{ id: row.id, code: code.trim() }] : [];
	});
}

const byCode = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** The codes of the project's Shots, each once as first met, in order: what the slate's field suggests. */
export function codesOf(rows: readonly Row[]): string[] {
	const seen = new Map<string, string>();
	for (const shot of shotsOf(rows)) if (!seen.has(codeKey(shot.code))) seen.set(codeKey(shot.code), shot.code);
	return [...seen.values()].sort(byCode);
}

/**
 * From the codes before and after an edit: the Shots to link, the Shots to unlink, and the codes
 * no Shot has. Every Shot of a typed code is linked again: adding a Shot already there changes
 * nothing (field_types/multi_entity.md), and a Shot made since the last sync gets its link. Only
 * the Shots of the codes taken off are unlinked, so a link made in Flow PT stays. A code that two
 * Shots have links both: Shot codes are not unique.
 */
export function shotLink(before: readonly string[], after: readonly string[], shots: readonly ShotRow[]): ShotLink {
	const keep = new Set(after.map(codeKey));
	const gone = new Set(before.map(codeKey).filter((key) => !keep.has(key)));
	const ids = (want: Set<string>) => [...new Set(shots.filter((s) => want.has(codeKey(s.code))).map((s) => s.id))].sort((a, b) => a - b);
	const add = ids(keep);
	const remove = ids(gone).filter((id) => !add.includes(id));
	const known = new Set(shots.map((s) => codeKey(s.code)));
	const waiting = shotCodes(after).filter((code) => !known.has(codeKey(code)));
	return { add, remove, waiting };
}

/** The value of a write that adds or removes Shots in place. */
export function linkValue(mode: 'add' | 'remove', ids: readonly number[]) {
	return { multi_entity_update_mode: mode, value: ids.map((id) => ({ type: SHOT, id })) };
}

/** The codes an operation on a slate takes off and puts on, if it touches them. */
export function shotChange(op: Op): { before: string[]; after: string[] } | undefined {
	if (op.table !== 'slate') return undefined;
	if (op.kind === 'create') {
		const after = shotCodes(op.fields[SHOT_CODES_KEY]);
		return after.length ? { before: [], after } : undefined;
	}
	if (op.kind === 'update') {
		const edit = op.changes[SHOT_CODES_KEY];
		return edit ? { before: shotCodes(edit.base), after: shotCodes(edit.value) } : undefined;
	}
	return undefined;
}
