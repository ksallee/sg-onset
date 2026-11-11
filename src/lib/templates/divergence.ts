// How a linked entry stands against its template: which fields no longer hold the template's
// value, the patch that puts them back, and the patch that unlinks it. Pure.

import { change, type Patch } from '$lib/model/patch';
import { sameValue } from '$lib/model/value';

type Linked = { id: string; templateId?: string };
type AnyTemplate = { id: string; values: object };

/** The fields the template holds whose value the entry no longer has, in template order. */
export function diverged(template: AnyTemplate, record: { id: string }): string[] {
	const row = record as Record<string, unknown>;
	return Object.entries(template.values)
		.filter(([key, value]) => !sameValue(row[key], value))
		.map(([key]) => key);
}

/** Puts the template's value back in the fields that differ, or in `keys` of them. */
export function reapplyPatch(template: AnyTemplate, record: { id: string }, keys?: readonly string[]): Patch {
	const values = template.values as Record<string, unknown>;
	return diverged(template, record)
		.filter((key) => !keys || keys.includes(key))
		.map((key) => change(record, key, values[key]));
}

/** Clears the link. The values stay as they are. Nothing when there is no link. */
export function unlinkPatch(record: Linked): Patch {
	return record.templateId === undefined ? [] : [change(record, 'templateId', undefined)];
}
