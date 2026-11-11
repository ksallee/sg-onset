// Live templates. A slate or take made from a template stays linked to it by `templateId`. When
// the template is edited the user picks how far the edit reaches; the preview shows both. Pure.

import { applyPatch, invertPatch, type Patch } from './patch';
import type { FieldsOf } from './types';
import { sameValue } from './value';

export type TemplateScope = 'slate' | 'take';

export type Template<S extends TemplateScope = TemplateScope> = {
	id: string;
	name: string;
	scope: S;
	/** The fields the template sets. A field it does not hold is left to the record. */
	values: FieldsOf<S>;
};

/**
 * How far a template edit reaches.
 * - `untouched`: only fields still holding the old template value. A hand-typed value stays.
 * - `all`: every field the edit changed, hand-typed or not.
 */
export type TemplateEditMode = 'untouched' | 'all';

/** One field of one record that a template edit would change. */
export type TemplateChange = {
	id: string;
	key: string;
	from: unknown;
	to: unknown;
	/** The record no longer holds the old template value: only mode `all` changes it. */
	touched: boolean;
};

type Linked = { id: string; templateId?: string };
type AnyTemplate = { id: string; values: object };

/** A new record filled from the template and linked to it. `base` has the id and wins over the template. */
export function createFromTemplate<T extends Linked>(template: AnyTemplate, base: T): T {
	return { ...template.values, ...base, templateId: template.id };
}

/**
 * What editing `oldTemplate` into `newTemplate` would change, per record and field, in record
 * order. Only records linked to the template, and only fields whose template value changed.
 * A field the template drops is cleared where it still holds the old value and never where it
 * was typed by hand, so that case is not listed.
 */
export function previewTemplateEdit<T extends Linked>(records: readonly T[], oldTemplate: AnyTemplate, newTemplate: AnyTemplate): TemplateChange[] {
	const before = oldTemplate.values as Record<string, unknown>;
	const after = newTemplate.values as Record<string, unknown>;
	const edited = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !sameValue(before[key], after[key]));
	const changes: TemplateChange[] = [];
	for (const record of records) {
		if (record.templateId !== oldTemplate.id) continue;
		for (const key of edited) {
			const from = (record as Record<string, unknown>)[key];
			const to = after[key];
			if (sameValue(from, to)) continue;
			const touched = !sameValue(from, before[key]);
			if (touched && to === undefined) continue;
			changes.push({ id: record.id, key, from, to, touched });
		}
	}
	return changes;
}

/**
 * Applies a template edit to the records linked to it. Returns the new records, the patch that
 * was applied and the patch that undoes it.
 */
export function applyTemplateEdit<T extends Linked>(
	records: readonly T[],
	oldTemplate: AnyTemplate,
	newTemplate: AnyTemplate,
	mode: TemplateEditMode
): { records: T[]; patch: Patch; inverse: Patch } {
	const patch: Patch = previewTemplateEdit(records, oldTemplate, newTemplate)
		.filter((c) => mode === 'all' || !c.touched)
		.map(({ id, key, from, to }) => ({ id, key, from, to }));
	return { records: applyPatch(records, patch), patch, inverse: invertPatch(patch) };
}
