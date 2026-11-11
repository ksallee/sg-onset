// Typed text to a value that may be saved: read as the catalogue field says (`parseField`), then
// checked (`validateValue`). Pure. The page shows the issue with `issueText`, or saves the value
// with `app.edit.set`.

import { findField, type FieldDef, type Scope } from '$lib/model/catalogue';
import { parseField } from '$lib/model/fieldText';
import type { UnitSystem } from '$lib/model/length';
import type { FieldValue } from '$lib/model/types';
import { validateValue, type Issue } from '$lib/model/validate';

export type FieldRead = { ok: true; def: FieldDef; value: FieldValue | undefined } | { ok: false; def?: FieldDef; issue: Issue };

/**
 * What `text` means in field `key` of `scope` (an end key reads as its field, and is never
 * required). Empty text clears the field: `value` is undefined.
 */
export function readField(scope: Scope, key: string, text: string, units: UnitSystem): FieldRead {
	const found = findField(scope, key);
	if (!found) return { ok: false, issue: { key: 'validation.type', params: { type: 'string' } } };
	const def: FieldDef = found.end ? { ...found.def, required: undefined } : found.def;
	const parsed = parseField(def, text, units);
	if (!parsed.ok) return { ok: false, def, issue: parsed.issue };
	const [issue] = validateValue(def, parsed.value);
	return issue ? { ok: false, def, issue } : { ok: true, def, value: parsed.value };
}
