// A slate's link to its Shots: the VFX shot codes typed on the slate, matched to the Shots of the
// Flow PT project. Each code is also a Set Shot (setShots.ts), which says what the slate links.
// Pure: the search and the writes are in transport.ts.
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
 * What one slate's codes ask of its Set Shots and Shots fields (setShots.ts, `slateLinks`):
 * - `link`: codes the slate holds whose Set Shots and Shots to link. Adding a link already there
 *   changes nothing (field_types/multi_entity.md).
 * - `unlink`: codes taken off whose links to unlink. Only those: a link made in Flow PT stays.
 * - `check`: codes already linked, looked at again to see whether several Shots still share them.
 *   Never linked again: a Shot a person unlinked stays unlinked.
 */
export type ShotWork = { link: readonly string[]; unlink: readonly string[]; check: readonly string[] };

/** The value of a write that adds or removes links in place: Shots, or rows of `type`. */
export function linkValue(mode: 'add' | 'remove', ids: readonly number[], type = SHOT) {
	return { multi_entity_update_mode: mode, value: ids.map((id) => ({ type, id })) };
}

/** The codes an operation on a slate holds and the codes it takes off, if it touches them. */
export function shotChange(op: Op): { link: string[]; unlink: string[] } | undefined {
	if (op.table !== 'slate') return undefined;
	if (op.kind === 'create') {
		const link = shotCodes(op.fields[SHOT_CODES_KEY]);
		return link.length ? { link, unlink: [] } : undefined;
	}
	if (op.kind === 'update') {
		const edit = op.changes[SHOT_CODES_KEY];
		if (!edit) return undefined;
		const link = shotCodes(edit.value);
		const kept = new Set(link.map(codeKey));
		return { link, unlink: shotCodes(edit.base).filter((code) => !kept.has(codeKey(code))) };
	}
	return undefined;
}
