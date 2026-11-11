// Bulk edit of takes: the fields offered, and what an edit would do before it is applied. The
// edit itself is the model's `bulkEdit` patch, applied through the editor as one undo. Pure.

import { bulkEdit } from '$lib/model/bulkEdit';
import { change, type Change, type Patch } from '$lib/model/patch';
import type { Take } from '$lib/model/types';
import { sameValue } from '$lib/model/value';
import { fieldRefs, type FieldRef } from './fields';

/** Belong to one take each: never set on many at once. */
const OWN = new Set(['take', 'startedAt', 'endedAt']);

/** The marks a take can carry: set or cleared on many takes at once. */
export const MARKS = ['circleTake', 'noGood'] as const;

/** The take fields a bulk edit can set or clear, in catalogue order, ends included. */
export function bulkFields(): FieldRef[] {
	return fieldRefs('take').filter((f) => !OWN.has(f.def.key));
}

/** Of the chosen takes, which `key = value` would change and which already hold it. In take order. */
export function bulkPreview(takes: readonly Take[], ids: Iterable<string>, key: string, value: unknown): { change: string[]; already: string[] } {
	const chosen = new Set(ids);
	const { patch } = bulkEdit(takes, chosen, key as keyof Take & string, value as never);
	const changing = new Set(patch.map((c) => c.id));
	const there = takes.filter((t) => chosen.has(t.id));
	return { change: there.filter((t) => changing.has(t.id)).map((t) => t.id), already: there.filter((t) => !changing.has(t.id)).map((t) => t.id) };
}

/**
 * Links the chosen takes to a template and fills every field it holds: what "Use template" does
 * to takes shot before it existed. Takes already linked and holding every value are left out.
 */
export function linkPreview(takes: readonly { id: string; templateId?: string }[], ids: Iterable<string>, template: { id: string; values: object }): { patch: Patch; change: string[]; already: string[] } {
	const chosen = new Set(ids);
	const values = Object.entries(template.values) as [string, unknown][];
	const patch: Change[] = [];
	const changing: string[] = [];
	const already: string[] = [];
	for (const take of takes) {
		if (!chosen.has(take.id)) continue;
		const row = take as Record<string, unknown>;
		const mine: Change[] = [
			...(take.templateId === template.id ? [] : [change(take, 'templateId', template.id)]),
			...values.filter(([key, value]) => !sameValue(row[key], value)).map(([key, value]) => change(take, key, value))
		];
		(mine.length ? changing : already).push(take.id);
		patch.push(...mine);
	}
	return { patch, change: changing, already };
}
