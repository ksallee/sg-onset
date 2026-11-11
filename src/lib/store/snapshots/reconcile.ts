// What restoring a snapshot does to the records and to the queue. Pure.
//
// The records, the trash and the file descriptions come back as the snapshot holds them. The
// snapshot's own queue does not: it is from the past, and some of it may have been sent since.
// The queue is rebuilt from what we know now about Flow PT:
//
// - Entries that were sent, or may have been (in flight, unconfirmed), or wait for a person, stay
//   as they are. The runner settles them. Unsent entries (pending, waiting to retry) are dropped.
// - Whether Flow PT holds a record: it has a server id, then each kept create or delete of it in
//   order says it will, or will not.
// - A record the snapshot holds and Flow PT holds: an update of the fields that differ. The base is
//   what Flow PT is believed to hold: the current value, with every dropped edit undone to its
//   base. A wrong belief is caught by the conflict check before sending: a conflict, never a
//   silent overwrite.
// - A record the snapshot holds and Flow PT does not: a create with the snapshot's values. This
//   covers a record never sent, and one whose delete was confirmed since.
// - A record Flow PT holds and the snapshot does not: a delete. It goes to the trash, as a remove.
// - A file the snapshot describes, not verified, not being uploaded: an upload.
// - Server ids are never forgotten: they are facts about Flow PT, and newer than any snapshot.

import { sameValue } from '$lib/model/value';
import { isOpen, type Entry, type Op } from '$lib/outbox/types';
import { dependsOn, PARENTS, TABLES, type TableName } from '../tables';
import type { BlobMeta } from '../types';

export type Row = { id: string } & Record<string, unknown>;
export type TrashRow = { id: string; table: TableName; record: Row; deletedAt: number };
export type QueueOp = { op: Op; dependsOn: string[] };

/** One state of the store: a snapshot's, or now. */
export type Side = {
	tables: Partial<Record<string, Row[]>>;
	trash: TrashRow[];
	blobs: BlobMeta[];
};

export type Now = Side & {
	queue: readonly Entry[];
	/** Records Flow PT has given an id. */
	remotes: ReadonlySet<string>;
};

export type RestorePlan = {
	/** The record tables to write, whole. */
	tables: Record<string, Row[]>;
	trash: TrashRow[];
	/** The file descriptions to write, whole. */
	blobs: BlobMeta[];
	/** The entries kept from the queue. */
	queue: Entry[];
	/** What to add to it, in order, through the queue reducer. */
	ops: QueueOp[];
};

function depth(table: TableName): number {
	let d = 0;
	for (let t = PARENTS[table]; t; t = PARENTS[t.table]) d += 1;
	return d;
}

function rowsById(side: Side): Map<string, { table: TableName; row: Row }> {
	const out = new Map<string, { table: TableName; row: Row }>();
	for (const table of TABLES) for (const row of side.tables[table] ?? []) out.set(row.id, { table, row });
	return out;
}

const fieldsOf = ({ id: _id, ...fields }: Row): Record<string, unknown> => fields;

export function planRestore(snapshot: Side, now: Now, at = 0): RestorePlan {
	const before = rowsById(snapshot);
	const live = rowsById(now);
	const trashNow = new Map(now.trash.map((t) => [t.id, t]));
	const trashThen = new Map(snapshot.trash.filter((t) => !before.has(t.id)).map((t) => [t.id, t]));

	const kept = now.queue.filter((e) => !isOpen(e));
	const dropped = now.queue.filter(isOpen);
	const keptOf = new Map<string, Entry[]>();
	for (const e of [...kept].sort((a, b) => a.seq - b.seq)) keptOf.set(e.op.recordId, [...(keptOf.get(e.op.recordId) ?? []), e]);

	/** Flow PT will hold the record once the kept entries settle. */
	function onServer(id: string): boolean {
		let exists = now.remotes.has(id);
		for (const e of keptOf.get(id) ?? []) {
			if (e.op.kind === 'create') exists = true;
			if (e.op.kind === 'delete') exists = false;
		}
		return exists;
	}

	/** What Flow PT is believed to hold: the current record, with dropped edits undone to their base. */
	function belief(id: string): Record<string, unknown> {
		const row = live.get(id)?.row ?? trashNow.get(id)?.record;
		const out: Record<string, unknown> = row ? fieldsOf(row) : {};
		const undone = new Set<string>();
		for (const e of [...dropped].sort((a, b) => a.seq - b.seq)) {
			if (e.op.kind !== 'update' || e.op.recordId !== id) continue;
			for (const [key, edit] of Object.entries(e.op.changes)) {
				if (undone.has(key)) continue;
				undone.add(key);
				if (edit.base === undefined) delete out[key];
				else out[key] = edit.base;
			}
		}
		return out;
	}

	type Planned = QueueOp & { depth: number; order: number };
	const planned: Planned[] = [];
	const trash = new Map<string, TrashRow>(trashThen);
	const ids = new Map<string, TableName>();
	for (const [id, { table }] of [...before, ...live]) ids.set(id, table);
	for (const t of now.trash) if (!ids.has(t.id)) ids.set(t.id, t.table);

	for (const [id, table] of ids) {
		const order = TABLES.indexOf(table);
		const then = before.get(id)?.row;
		const server = onServer(id);
		if (then) {
			const fields = fieldsOf(then);
			if (!server) {
				planned.push({ op: { kind: 'create', table, recordId: id, fields }, dependsOn: dependsOn(table, fields), depth: depth(table), order });
				continue;
			}
			const held = belief(id);
			const changes: Record<string, { base: unknown; value: unknown }> = {};
			for (const key of new Set([...Object.keys(held), ...Object.keys(fields)])) {
				if (!sameValue(held[key], fields[key])) changes[key] = { base: held[key], value: fields[key] };
			}
			if (Object.keys(changes).length) {
				const values = Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.value]));
				planned.push({ op: { kind: 'update', table, recordId: id, changes }, dependsOn: dependsOn(table, values), depth: depth(table), order });
			}
			continue;
		}
		if (server) {
			planned.push({ op: { kind: 'delete', table, recordId: id }, dependsOn: [], depth: 100 - depth(table), order });
			const record = live.get(id)?.row ?? trashNow.get(id)?.record;
			if (!trash.has(id) && record) trash.set(id, trashNow.get(id) ?? { id, table, record, deletedAt: at });
		} else if (keptOf.has(id) && trashNow.has(id) && !trash.has(id)) {
			// A delete on its way: its trash row waits for the confirmation.
			trash.set(id, trashNow.get(id)!);
		}
	}

	// Files: the snapshot's descriptions, with what we learnt since about Flow PT holding them.
	const factsNow = new Map(now.blobs.map((b) => [b.id, b]));
	const blobs = snapshot.blobs.map((b) => {
		const known = factsNow.get(b.id);
		if (!known) return b;
		return {
			...b,
			...(known.verifiedAt !== undefined ? { verifiedAt: known.verifiedAt } : {}),
			...(known.remoteId !== undefined ? { remoteId: known.remoteId } : {}),
			...(known.prunedAt !== undefined ? { prunedAt: known.prunedAt } : {})
		};
	});
	const uploading = new Set(kept.flatMap((e) => (e.op.kind === 'blob' ? [e.op.blobId] : [])));
	const uploads: QueueOp[] = blobs
		.filter((b) => before.has(b.recordId) && b.verifiedAt === undefined && b.prunedAt === undefined && !uploading.has(b.id))
		.map((b) => ({ op: { kind: 'blob', table: b.table, recordId: b.recordId, blobId: b.id, size: b.size, type: b.type }, dependsOn: [b.recordId] }));

	planned.sort((a, b) => a.depth - b.depth || a.order - b.order || a.op.recordId.localeCompare(b.op.recordId));
	const tables: Record<string, Row[]> = {};
	for (const table of TABLES) if (snapshot.tables[table]) tables[table] = snapshot.tables[table]!;
	return {
		tables,
		trash: [...trash.values()],
		blobs,
		queue: kept,
		ops: [...planned.map(({ op, dependsOn }) => ({ op, dependsOn })), ...uploads]
	};
}

/** Records per table that restoring `snapshot` over `now` would add, remove and change. */
export function diffTables(snapshot: Side['tables'], now: Side['tables']): Record<string, { added: number; removed: number; changed: number }> {
	const out: Record<string, { added: number; removed: number; changed: number }> = {};
	for (const table of new Set([...Object.keys(snapshot), ...Object.keys(now)])) {
		const then = new Map((snapshot[table] ?? []).map((r) => [r.id, r]));
		const current = new Map((now[table] ?? []).map((r) => [r.id, r]));
		const diff = { added: 0, removed: 0, changed: 0 };
		for (const [id, row] of then) {
			const other = current.get(id);
			if (!other) diff.added += 1;
			else if (!sameValue(row, other)) diff.changed += 1;
		}
		for (const id of current.keys()) if (!then.has(id)) diff.removed += 1;
		if (diff.added || diff.removed || diff.changed) out[table] = diff;
	}
	return out;
}
