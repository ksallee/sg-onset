// Bulk edit: one field set on many records at once, with the patch that undoes it. Pure.

import { applyPatch, change, invertPatch, type Patch } from './patch';
import { sameValue } from './value';

/**
 * Sets `key` to `value` on the records whose id is in `ids`; `undefined` clears it. A record
 * already at the value is left out of the patch. Returns the new records, the patch that was
 * applied and the patch that undoes it.
 */
export function bulkEdit<T extends { id: string }, K extends keyof T & string>(
	records: readonly T[],
	ids: Iterable<string>,
	key: K,
	value: T[K] | undefined
): { records: T[]; patch: Patch; inverse: Patch } {
	const chosen = new Set(ids);
	const patch: Patch = records
		.filter((record) => chosen.has(record.id) && !sameValue(record[key], value))
		.map((record) => change(record, key, value));
	return { records: applyPatch(records, patch), patch, inverse: invertPatch(patch) };
}
