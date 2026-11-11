// The fields a template may hold. A slate template: every slate field but the slate name, which
// is one board number. A take template: what carries from take to take (the catalogue's `carry`),
// ends included; the take number, times, marks, notes, clip and timecode belong to one take.
// Pure.

import type { FieldsOf } from '$lib/model/types';
import type { TemplateScope } from '$lib/model/template';
import { fieldRefs, type FieldRef } from '$lib/slates/fields';

export function templateFields(scope: TemplateScope): FieldRef[] {
	if (scope === 'slate') return fieldRefs('slate').filter((f) => f.key !== 'slateUID');
	return fieldRefs('take').filter((f) => f.def.carry !== false);
}

/** The values a template of `scope` would take from a record: the fields it may hold that the record has. Copied. */
export function valuesFrom<S extends TemplateScope>(scope: S, record: object): FieldsOf<S> {
	const row = record as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const f of templateFields(scope)) if (row[f.key] !== undefined) out[f.key] = structuredClone(row[f.key]);
	return out as FieldsOf<S>;
}
