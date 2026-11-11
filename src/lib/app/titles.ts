// What a record is called in a list or a notice: the value of the field its scope requires
// (the catalogue's `required`): a project's name, a slate's slateUID, a take's number. Pure.

import { fieldsOf, SCOPES, type Scope } from '$lib/model/catalogue';

/** The key of the field that names a record of `table`. A still has none. */
export function nameKey(table: string): string | undefined {
	if (!(SCOPES as readonly string[]).includes(table)) return undefined;
	return fieldsOf(table as Scope).find((d) => d.required)?.key;
}

/** The name of `row`, a record of `table`. Empty when it has none. */
export function recordTitle(table: string, row: object | undefined): string {
	const key = nameKey(table);
	const value = key && row ? (row as Record<string, unknown>)[key] : undefined;
	if (typeof value === 'string') return value.trim();
	if (table === 'still' && row) return ((row as { caption?: string }).caption ?? '').trim();
	return '';
}
