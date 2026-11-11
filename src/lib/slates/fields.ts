// The keys a form can show for a scope: each catalogue field, and right after it its end for a
// field that changes over a take (tilt, then tiltEnd). Pure.

import { endKey, fieldsOf, findField, type FieldDef, type Scope } from '$lib/model/catalogue';

/** One key of a record: a field, or the end value of a field (`end`). */
export type FieldRef = { key: string; def: FieldDef; end: boolean };

export function fieldRefs(scope: Scope): FieldRef[] {
	return fieldsOf(scope).flatMap((def) => [{ key: def.key, def, end: false }, ...(def.end ? [{ key: endKey(def.key), def, end: true }] : [])]);
}

export function fieldRef(scope: Scope, key: string): FieldRef | undefined {
	const found = findField(scope, key);
	return found ? { key, def: found.def, end: found.end } : undefined;
}
