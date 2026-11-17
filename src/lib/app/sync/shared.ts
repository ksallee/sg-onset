// The lists a show shares, read back from Flow PT at each sync and merged with this device's (#110):
// cameras, lenses, lighting setups, templates and the kinds of set reference a project adds. Every
// device of the project then has the same lists, and a new one starts with them. Slates, takes and
// references stay with the device that made them: they are not read back. Pure: the store applies
// the plan (`reconcile`), the transport reads (lib/fpt).
//
// The rules (Kevin, #110):
// - A record is matched by its client UUID, the id it has on every device.
// - A record made on another device is added here.
// - A field changed on another device is taken, unless it was edited here and the edit is not
//   synced yet: that edit is never overwritten. It goes up as any edit does, and the conflict check
//   catches a field both changed (lib/outbox README, Conflicts).
// - A record removed on another device is removed here, unless something here uses it or an edit of
//   it waits here: then it is kept, listed in the sync sheet, and sent back to Flow PT.

import { sameValue } from '$lib/model/value';
import { isActive, isOpen, type Entry, type RemoteId } from '$lib/outbox/types';
import type { TableName } from '$lib/store/tables';

export const SHARED_TABLES = ['camera', 'lens', 'lightingSetup', 'template', 'referenceKind'] as const;
export type SharedTable = (typeof SHARED_TABLES)[number];

export type Row = { id: string } & Record<string, unknown>;

/** One record as Flow PT holds it, in our field form. */
export type Pulled = { id: string; remoteId: RemoteId; fields: Record<string, unknown> };

/**
 * What a sync read of one table: every record of the project Flow PT holds. `keys`: the keys Flow PT
 * holds of a record; any other key is the device's alone. `complete`: the read reached the end of
 * the list. Short of it, nothing is judged removed.
 */
export type PulledTable = { table: SharedTable; keys: readonly string[]; records: readonly Pulled[]; complete: boolean };

/** What the device holds, read in the same transaction as the plan is applied. */
export type LocalState = {
	/** The project of this device the lists belong to. */
	projectId: string;
	/** The table's records, of every project: the others are left alone. */
	rows: readonly Row[];
	/** The server ids known, by client UUID. */
	remotes: Readonly<Record<string, RemoteId>>;
	/** The queue. */
	entries: readonly Entry[];
	/** Records removed here, still in the trash. */
	trashed: ReadonlySet<string>;
	/** Records something on this device uses (`usedIds`). */
	used: ReadonlySet<string>;
};

export type SharedPlan = {
	/** Made on another device: put here, nothing queued. */
	add: Row[];
	/** The values Flow PT holds of fields not edited here. `undefined` clears the field. Nothing queued. */
	change: { id: string; set: Record<string, unknown> }[];
	/** Removed on another device, unused here: removed here, nothing queued. */
	remove: string[];
	/** Removed on another device, used or edited here: kept, and listed. */
	kept: string[];
	/** Of `kept`, those sent back now: their server id is dropped and a create queued with the record as it is. */
	resend: string[];
	/** Here only, never sent, nothing queued: a create is queued now. */
	push: string[];
	/** Server ids to keep. */
	remoteIds: Record<string, RemoteId>;
};

/** The keys of a record edited here and not confirmed: `all` while its create is not. */
function pendingKeys(entries: readonly Entry[]): Set<string> | 'all' {
	const keys = new Set<string>();
	for (const e of entries) {
		if (e.op.kind === 'create') return 'all';
		if (e.op.kind === 'update') for (const key of Object.keys(e.op.changes)) keys.add(key);
	}
	return keys;
}

/** What to do to bring the device's records of one table in line with what Flow PT holds. */
export function mergeShared(pulled: PulledTable, local: LocalState): SharedPlan {
	const plan: SharedPlan = { add: [], change: [], remove: [], kept: [], resend: [], push: [], remoteIds: {} };
	const rows = local.rows.filter((r) => r.projectId === local.projectId);
	const byId = new Map(rows.map((r) => [r.id, r]));
	const active = new Map<string, Entry[]>();
	for (const e of local.entries) {
		if (!isActive(e) || e.op.kind === 'blob') continue;
		active.set(e.op.recordId, [...(active.get(e.op.recordId) ?? []), e]);
	}
	const there = new Set<string>();

	for (const record of pulled.records) {
		there.add(record.id);
		const row = byId.get(record.id);
		const entries = active.get(record.id) ?? [];
		if (!row) {
			// Removed here: its delete goes up. Another project's record is not ours to take.
			if (local.trashed.has(record.id) || local.rows.some((r) => r.id === record.id)) continue;
			plan.add.push({ id: record.id, projectId: local.projectId, ...record.fields });
			plan.remoteIds[record.id] = record.remoteId;
			continue;
		}
		const pending = pendingKeys(entries);
		if (pending === 'all') continue;
		if (local.remotes[record.id] === undefined) plan.remoteIds[record.id] = record.remoteId;
		const set: Record<string, unknown> = {};
		for (const key of pulled.keys) {
			if (key === 'id' || key === 'projectId' || pending.has(key)) continue;
			if (!sameValue(row[key], record.fields[key])) set[key] = record.fields[key];
		}
		if (Object.keys(set).length) plan.change.push({ id: record.id, set });
	}

	for (const row of rows) {
		if (there.has(row.id)) continue;
		const entries = active.get(row.id) ?? [];
		if (local.remotes[row.id] === undefined) {
			// Never on Flow PT. Its create waits in the queue, or it was kept here before the list was shared.
			if (!entries.length) plan.push.push(row.id);
			continue;
		}
		if (!pulled.complete) continue;
		if (!local.used.has(row.id) && !entries.length) {
			plan.remove.push(row.id);
			continue;
		}
		plan.kept.push(row.id);
		// An entry under way may land yet: the record is sent back at a later sync.
		if (entries.every((e) => isOpen(e) || e.state === 'needsAttention')) plan.resend.push(row.id);
	}
	return plan;
}

/** How many changes to templates and reference kinds wait: on a site without the Project fields, all of them. */
export function listsWaiting(queue: readonly Entry[]): number {
	return queue.filter((e) => isActive(e) && (e.op.table === 'template' || e.op.table === 'referenceKind')).length;
}

/** A record removed on another device and kept here, for the sync sheet. */
export type Kept = { table: SharedTable; id: string };

/** The sync sheet's list after a pull: what was kept before this session, then what this pull kept, each once. */
export function keepKept(before: readonly Kept[], now: readonly Kept[]): Kept[] {
	const out = [...before];
	for (const k of now) if (!out.some((o) => o.table === k.table && o.id === k.id)) out.push(k);
	return out;
}

/** Where a kept record is opened: its page, or none for a record edited in place. */
export function keptHref(kept: Kept): string | undefined {
	if (kept.table === 'camera' || kept.table === 'lens') return `/gear?sel=${encodeURIComponent(`${kept.table}.${kept.id}`)}`;
	if (kept.table === 'template') return `/templates/${encodeURIComponent(kept.id)}`;
	if (kept.table === 'referenceKind') return '/settings';
	return undefined;
}

/** The tables whose records may use a record of each shared table. */
export const USERS: Record<SharedTable, TableName[]> = {
	camera: ['take', 'cameraSetup'],
	lens: ['take', 'cameraSetup'],
	lightingSetup: ['slate'],
	template: ['slate', 'take'],
	referenceKind: ['reference']
};

/** The key a user holds the id of a shared record in. A kind is held by its name. */
const HELD_BY: Record<Exclude<SharedTable, 'referenceKind'>, string> = { camera: 'cameraId', lens: 'lensId', lightingSetup: 'lightingSetupId', template: 'templateId' };

const loose = (text: unknown) => (typeof text === 'string' ? text.trim().toLowerCase() : '');

/** The records of `table` that something on this device uses. `rows`: the table's records, for the kinds. */
export function usedIds(table: SharedTable, users: Partial<Record<TableName, readonly Row[]>>, rows: readonly Row[]): Set<string> {
	if (table === 'referenceKind') {
		const names = new Set((users.reference ?? []).map((r) => loose(r.kind)).filter((n) => n !== ''));
		return new Set(rows.filter((r) => names.has(loose(r.name))).map((r) => r.id));
	}
	const key = HELD_BY[table];
	const out = new Set<string>();
	for (const name of USERS[table]) for (const r of users[name] ?? []) if (typeof r[key] === 'string' && r[key] !== '') out.add(r[key] as string);
	return out;
}
