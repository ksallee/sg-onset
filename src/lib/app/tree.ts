// A record and everything under it: a project, its days, their slates, their takes, their stills.
// The store's `remove` does not cascade; this finds what a cascade must take.

import { PARENTS, TABLES, type TableName } from '$lib/store/tables';

export type Node = { table: TableName; id: string };

/** The tables whose records have a parent in `table`. Pure. */
export function childTables(table: TableName): TableName[] {
	return TABLES.filter((t) => PARENTS[t]?.table === table);
}

/**
 * The record and its descendants, deepest first: the order to remove them in, so no record is
 * ever left without its parent. `list` is the store's `list`.
 */
export async function collectTree(list: (table: TableName, parentId: string) => Promise<{ id: string }[]>, table: TableName, id: string): Promise<Node[]> {
	const out: Node[] = [];
	for (const child of childTables(table)) {
		for (const row of await list(child, id)) out.push(...(await collectTree(list, child, row.id)));
	}
	out.push({ table, id });
	return out;
}
