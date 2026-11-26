// What waits on the device for an entity the site lacks (Kevin, #117). Set Reference is optional:
// on a site without it, the entries of the set references stay in the queue, as they are, and the
// runner never sees them. Nothing is dropped and nothing needs a person. They go at the first drain
// after an admin enables the entity and runs Set Up Fields, their links to slates after them. A Set
// Shot is no record on the device: what waits for it is in the codes on the slates. Pure.

import type { Unsynced } from '$lib/outbox/select';
import type { Entry } from '$lib/outbox/types';

/**
 * The tables whose entries wait on the device: the set references', on a site without Set
 * Reference; the templates', the reference kinds' and the rigs', on a site without the Project
 * fields (#110, #138).
 */
export function waitingTables(setup: { referencesMissing?: boolean; setShotsMissing?: boolean; listsMissing?: boolean }): string[] {
	return [...(setup.referencesMissing ? ['reference'] : []), ...(setup.listsMissing ? ['template', 'referenceKind', 'rig'] : [])];
}

/** Whether an entry waits for an entity the site lacks. */
export function waits(entry: Entry, tables: readonly string[]): boolean {
	return tables.includes(entry.op.table);
}

/** The queue in two, each in order: what the runner may send, and what waits for an entity the site lacks. */
export function splitWaiting(queue: readonly Entry[], tables: readonly string[]): { open: Entry[]; waiting: Entry[] } {
	return { open: queue.filter((e) => !waits(e, tables)), waiting: queue.filter((e) => waits(e, tables)) };
}

/**
 * The changes waiting for other projects on this device: the whole queue less the current
 * project's, what waits there for an entity included.
 */
export function elsewhereCount(everything: Unsynced | undefined, scoped: Unsynced | undefined, waiting: Unsynced | undefined): number {
	const all = everything?.entries ?? 0;
	return Math.max(0, all - (scoped?.entries ?? all) - (waiting?.entries ?? 0));
}

// ------------------------------------------------------------------ optional fields (#138)
//
// An optional field of a record the site has (the Rig on Take and on Camera Setup, Kevin
// 2026-11-25) is not an entity: the record syncs, without the field. Its value stays on the
// record, so nothing is lost. Once the site has the field, every record that holds a value sends
// it, from no value in Flow PT: those synced while the field was missing too (the store's
// `refill`, outbox/queue.ts `refillQueue`). A field is named `<table>.<key>`, as schema.ts
// `missingFields` gives it.

const keyOf = (field: string, table: string): string | undefined => (field.startsWith(`${table}.`) ? field.slice(table.length + 1) : undefined);

/** The entry without the keys of the fields the site lacks: what the runner sends. The entry itself when it holds none. */
export function withoutFields(entry: Entry, fields: readonly string[]): Entry {
	const op = entry.op;
	if (op.kind !== 'create' && op.kind !== 'update') return entry;
	const keys = fields.flatMap((f) => keyOf(f, op.table) ?? []);
	const values: Record<string, unknown> = op.kind === 'create' ? op.fields : op.changes;
	if (!keys.some((k) => k in values)) return entry;
	const kept = Object.fromEntries(Object.entries(values).filter(([k]) => !keys.includes(k)));
	return { ...entry, op: op.kind === 'create' ? { ...op, fields: kept } : { ...op, changes: kept as typeof op.changes } };
}

/** The fields the site lacked when last seen and has now. None when nothing was kept: a device that never saw a field missing sent every value. */
export function arrivedFields(before: readonly string[] | undefined, now: readonly string[]): string[] {
	return (before ?? []).filter((f) => !now.includes(f));
}

/** What the device keeps of the fields a site lacked: their names, as JSON. */
export function writeLacking(fields: readonly string[]): string {
	return JSON.stringify(fields);
}

/** The fields kept. Undefined for nothing kept, or text this version cannot read. */
export function readLacking(raw: string | null | undefined): string[] | undefined {
	if (!raw) return undefined;
	try {
		const value: unknown = JSON.parse(raw);
		return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : undefined;
	} catch {
		return undefined;
	}
}
