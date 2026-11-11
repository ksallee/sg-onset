// Patches: a list of field changes, each holding the value before and after. Undo is the same
// list reversed with before and after swapped. Template edits and bulk edits return one. Pure.

/** One field of one record changing. `undefined` on either side means the field is absent. */
export type Change = { id: string; key: string; from: unknown; to: unknown };

export type Patch = readonly Change[];

/** The change that sets `key` on `record` to `to`. */
export function change(record: { id: string }, key: string, to: unknown): Change {
	return { id: record.id, key, from: (record as Record<string, unknown>)[key], to };
}

/**
 * The records with the patch applied, in order. A record the patch does not touch is returned as
 * is; a touched one is a new object. A change to a record that is not there is skipped.
 */
export function applyPatch<T extends { id: string }>(records: readonly T[], patch: Patch): T[] {
	const byId = new Map<string, Change[]>();
	for (const c of patch) byId.set(c.id, [...(byId.get(c.id) ?? []), c]);
	return records.map((record) => {
		const changes = byId.get(record.id);
		if (!changes) return record;
		const next = { ...record } as Record<string, unknown>;
		for (const c of changes) {
			if (c.to === undefined) delete next[c.key];
			else next[c.key] = c.to;
		}
		return next as T;
	});
}

/** The patch that undoes `patch`. */
export function invertPatch(patch: Patch): Patch {
	return [...patch].reverse().map((c) => ({ id: c.id, key: c.key, from: c.to, to: c.from }));
}
