// The lists a show shares that Flow PT has no entity for: the live templates, and the kinds of set
// reference a project adds (#110). Each list is JSON in a text field of the Project the device
// syncs with, one field per list, so an edit of one never writes the other. Pure: the reads and
// writes are in transport.ts.
//
// From the corpus: a text field stores the string as sent, newlines kept, with no cap found at
// 100,000 characters; it strips outer spaces, which JSON never has, and stores "" as null
// (field_types/text.md). A custom jsonb field is unmeasured: the only two the corpus found are stock,
// and Note.meta is written on create only (field_types/jsonb.md).

import { sameValue } from '$lib/model/value';
import type { CreateOp, DeleteOp, UpdateOp } from '$lib/outbox/types';

export const LIST_TABLES = ['template', 'referenceKind'] as const;
export type ListTable = (typeof LIST_TABLES)[number];

export function isListTable(name: string): name is ListTable {
	return (LIST_TABLES as readonly string[]).includes(name);
}

/** The keys a list keeps of each entry, beside its id. The project is the field's own. */
export const LIST_KEYS: Record<ListTable, readonly string[]> = { template: ['name', 'scope', 'values'], referenceKind: ['name'] };

/** Keys a record carries that a list does not keep, and does not refuse. */
const IGNORED = new Set(['id', 'projectId']);

/** The format. A list written by a later version is read as unreadable, and never written over. */
export const LIST_VERSION = 1;

export type ListEntry = { id: string } & Record<string, unknown>;

/** What a field holds: its entries, or not `ok`: text this version cannot read. */
export type ListRead = { ok: true; entries: ListEntry[] } | { ok: false };

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function keep(table: ListTable, values: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of LIST_KEYS[table]) if (values[key] !== undefined) out[key] = values[key];
	return out;
}

/** The entries a field holds. Empty, it reads null (field_types/text.md): no entries. */
export function readList(table: ListTable, raw: unknown): ListRead {
	if (raw === null || raw === undefined || raw === '') return { ok: true, entries: [] };
	if (typeof raw !== 'string') return { ok: false };
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { ok: false };
	}
	if (!isObject(value) || value.list !== table || value.version !== LIST_VERSION || !Array.isArray(value.entries)) return { ok: false };
	const entries: ListEntry[] = [];
	for (const e of value.entries) {
		if (!isObject(e) || typeof e.id !== 'string' || e.id === '') return { ok: false };
		entries.push({ id: e.id, ...keep(table, e) });
	}
	return { ok: true, entries };
}

/** The text of a field holding these entries. Every entry whole: nothing is cut to fit. */
export function writeList(table: ListTable, entries: readonly ListEntry[]): string {
	return JSON.stringify({ list: table, version: LIST_VERSION, entries: entries.map((e) => ({ id: e.id, ...keep(table, e) })) });
}

export type ListOp = { entryId: string; op: CreateOp | UpdateOp | DeleteOp };

/**
 * - `duplicate`: a create whose id the list holds: it was made before.
 * - `gone`: an update or a delete of an entry the list no longer holds.
 * - `invalid`: a key the list has no place for. Refused, never dropped.
 */
export type ListRefusal = { entryId: string; reason: 'duplicate' | 'gone' | 'invalid'; message?: string };

function stray(table: ListTable, keys: readonly string[]): string | undefined {
	return keys.find((key) => !IGNORED.has(key) && !LIST_KEYS[table].includes(key));
}

/** The list after these operations, in order, and the ones it refuses. The entries given are left alone. */
export function applyListOps(table: ListTable, entries: readonly ListEntry[], ops: readonly ListOp[]): { entries: ListEntry[]; refusals: ListRefusal[] } {
	let next = entries.map((e) => ({ ...e }));
	const refusals: ListRefusal[] = [];
	for (const { entryId, op } of ops) {
		const at = next.findIndex((e) => e.id === op.recordId);
		if (op.kind === 'create') {
			const key = stray(table, Object.keys(op.fields));
			if (key) refusals.push({ entryId, reason: 'invalid', message: `${table}.${key} has no field in Flow Production Tracking` });
			else if (at >= 0) refusals.push({ entryId, reason: 'duplicate' });
			else next.push({ id: op.recordId, ...keep(table, op.fields) });
		} else if (op.kind === 'update') {
			const key = stray(table, Object.keys(op.changes));
			if (key) refusals.push({ entryId, reason: 'invalid', message: `${table}.${key} has no field in Flow Production Tracking` });
			else if (at < 0) refusals.push({ entryId, reason: 'gone' });
			else {
				const entry = { ...next[at] };
				for (const [k, edit] of Object.entries(op.changes)) {
					if (IGNORED.has(k)) continue;
					if (edit.value === undefined) delete entry[k];
					else entry[k] = edit.value;
				}
				next[at] = entry;
			}
		} else if (at < 0) refusals.push({ entryId, reason: 'gone' });
		else next = next.filter((_, i) => i !== at);
	}
	return { entries: next, refusals };
}

/** Whether the list holds every operation: a check after a write, as another device may have written the field between our read and our write. */
export function landed(table: ListTable, entries: readonly ListEntry[], ops: readonly ListOp[]): boolean {
	// Run again on what was read back, a create as a put: if they landed, they change nothing.
	const next = entries.map((e) => ({ ...e }));
	for (const { op } of ops) {
		const at = next.findIndex((e) => e.id === op.recordId);
		if (op.kind === 'create') {
			const entry = { id: op.recordId, ...keep(table, op.fields) };
			if (at >= 0) next[at] = entry;
			else next.push(entry);
		} else if (op.kind === 'update') {
			if (at < 0) return false;
			for (const [k, edit] of Object.entries(op.changes)) {
				if (IGNORED.has(k)) continue;
				if (edit.value === undefined) delete next[at][k];
				else next[at][k] = edit.value;
			}
		} else if (at >= 0) next.splice(at, 1);
	}
	if (next.length !== entries.length) return false;
	return entries.every((e) => {
		const n = next.find((x) => x.id === e.id);
		return n !== undefined && LIST_KEYS[table].every((key) => sameValue(e[key], n[key]));
	});
}

/** The values of `keys` an entry holds. */
export function listFields(entry: ListEntry, keys: readonly string[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of keys) if (key !== 'id' && entry[key] !== undefined) out[key] = entry[key];
	return out;
}
