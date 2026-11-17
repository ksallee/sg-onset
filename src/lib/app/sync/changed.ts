// The sync sheet's "Changed on another device" list (Kevin, #110): a change read back from Flow PT
// of an entry this device uses, until seen. Opening the row marks it seen. Nothing shows on the take
// screen: a take keeps the values it has. Kept on the device per project, beside the sync link, so
// a reload keeps what was not seen. Pure.

import { findField, SCOPES, type Scope } from '$lib/model/catalogue';
import { fieldLabel } from '$lib/i18n/modelText';
import { t } from '$lib/i18n/messages';
import { SHARED_TABLES, type SharedTable } from './shared';

/** One entry changed on another device: the fields taken in, and when, ms. */
export type Changed = { table: SharedTable; id: string; keys: string[]; at: number };

/** The key of a project's list, in the sync key-value store. */
export const changedKey = (projectId: string) => `changed:${projectId}`;

const same = (c: Changed, table: string, id: string) => c.table === table && c.id === id;
const newest = (a: Changed, b: Changed) => b.at - a.at;

/**
 * The list after a merge of `table`: each entry used here that took a change, with its fields, at
 * `at`, one row each, newest first. An entry changed again before it was seen keeps one row, with
 * every field taken. Entries removed here since leave the list.
 */
export function noteChanged(list: readonly Changed[], table: SharedTable, found: readonly { id: string; keys: readonly string[] }[], removed: readonly string[], at: number): Changed[] {
	if (!found.length && !removed.some((id) => list.some((c) => same(c, table, id)))) return list as Changed[];
	let next = list.filter((c) => !(c.table === table && removed.includes(c.id)));
	for (const { id, keys } of found) {
		const before = next.find((c) => same(c, table, id));
		next = [{ table, id, keys: [...new Set([...(before?.keys ?? []), ...keys])], at }, ...next.filter((c) => !same(c, table, id))];
	}
	return next.sort(newest);
}

/** The list without an entry: it was seen. */
export function markSeen(list: readonly Changed[], table: string, id: string): Changed[] {
	return list.some((c) => same(c, table, id)) ? list.filter((c) => !same(c, table, id)) : (list as Changed[]);
}

/** What was stored. A row this version cannot read is left out. */
export function parseChanged(raw: string | null | undefined): Changed[] {
	let value: unknown;
	try {
		value = raw ? JSON.parse(raw) : null;
	} catch {
		return [];
	}
	if (!Array.isArray(value)) return [];
	return value.flatMap((r): Changed[] => {
		if (r === null || typeof r !== 'object') return [];
		const { table, id, keys, at } = r as Record<string, unknown>;
		if (typeof table !== 'string' || !(SHARED_TABLES as readonly string[]).includes(table) || typeof id !== 'string' || id === '') return [];
		return [{ table: table as SharedTable, id, keys: Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [], at: typeof at === 'number' && Number.isFinite(at) ? at : 0 }];
	});
}

export function serializeChanged(list: readonly Changed[]): string {
	return JSON.stringify(list);
}

/** The fields taken, by the labels the forms show; a template's and a kind's as the template editor does. */
export function changedFields(table: SharedTable, keys: readonly string[]): string {
	const scope = (SCOPES as readonly string[]).includes(table) ? (table as Scope) : undefined;
	return keys
		.map((key) => {
			if (key === 'name' && !scope) return t('templates.edit.name');
			if (key === 'values' && table === 'template') return t('templates.edit.fields');
			const found = scope ? findField(scope, key) : undefined;
			return found ? fieldLabel(found.def, found.end) : key;
		})
		.join(', ');
}
