// The queue reducer: add an operation to the queue, merging it into what is still unsent. Pure.
//
// Merging happens only into an entry that is open (pending, or failed and waiting for a retry),
// and only into the last record entry of the same record. An entry in flight, unconfirmed or
// needing attention is never changed: the new operation becomes its own entry behind it.

import { sameValue } from '$lib/model/value';
import { isActive, isOpen, type Entry, type FieldEdit, type Fresh, type Op, type Queue } from './types';

function make(op: Op, dependsOn: readonly string[], fresh: Fresh): Entry {
	return { id: fresh.id, seq: fresh.seq, op, dependsOn: [...dependsOn], state: 'pending', attempts: 0, createdAt: fresh.now };
}

function union(a: readonly string[], b: readonly string[]): string[] {
	return [...new Set([...a, ...b])];
}

function replace(queue: Queue, old: Entry, next: Entry | undefined): Entry[] {
	return queue.flatMap((e) => (e === old ? (next ? [next] : []) : [e]));
}

/** The queue with `op` added. `dependsOn`: ids of the records the server must have first. */
export function enqueue(queue: Queue, op: Op, dependsOn: readonly string[], fresh: Fresh): Entry[] {
	if (op.kind === 'blob') return [...queue, make(op, dependsOn, fresh)];

	const mine = queue.filter((e) => isActive(e) && e.op.recordId === op.recordId);
	const recordOps = mine.filter((e) => e.op.kind !== 'blob').sort((a, b) => a.seq - b.seq);
	const last = recordOps.at(-1);
	const open = last && isOpen(last) ? last : undefined;

	if (op.kind === 'create') {
		// Deleted and brought back before the delete was sent: the server never knew.
		if (open?.op.kind === 'delete') return replace(queue, open, undefined);
		return [...queue, make(op, dependsOn, fresh)];
	}

	if (op.kind === 'delete') {
		// Never sent: nothing to delete on the server, nothing left to send.
		if (recordOps[0]?.op.kind === 'create' && isOpen(recordOps[0]) && mine.every(isOpen)) {
			return queue.filter((e) => !mine.includes(e));
		}
		if (last?.op.kind === 'delete') return [...queue];
		// Unsent uploads of a record about to be deleted are not worth sending.
		const kept = queue.filter((e) => !(mine.includes(e) && e.op.kind === 'blob' && isOpen(e)));
		return [...kept, make(op, dependsOn, fresh)];
	}

	const edits = Object.entries(op.changes).filter(([, c]) => !sameValue(c.base, c.value));

	if (open?.op.kind === 'create') {
		if (!Object.keys(op.changes).length) return [...queue];
		const fields = { ...open.op.fields };
		// Every change, typed text included: the create carries the record as it now is.
		for (const [key, c] of Object.entries(op.changes)) {
			if (c.value === undefined) delete fields[key];
			else fields[key] = c.value;
		}
		return replace(queue, open, { ...open, op: { ...open.op, fields }, dependsOn: union(open.dependsOn, dependsOn) });
	}

	if (open?.op.kind === 'update') {
		const changes: Record<string, FieldEdit> = { ...open.op.changes };
		for (const [key, c] of Object.entries(op.changes)) {
			const base = key in changes ? changes[key].base : c.base;
			if (sameValue(base, c.value)) delete changes[key];
			else changes[key] = { base, value: c.value };
		}
		if (!Object.keys(changes).length) return replace(queue, open, undefined);
		return replace(queue, open, { ...open, op: { ...open.op, changes }, dependsOn: union(open.dependsOn, dependsOn) });
	}

	if (!edits.length) return [...queue];
	return [...queue, make({ ...op, changes: Object.fromEntries(edits) }, dependsOn, fresh)];
}

/**
 * The queue without the upload of file `blobId`, while it has not left: a file replaced before it
 * was sent (a photo's annotated copy, drawn on again). Undefined once an upload of it is in
 * flight, may have landed or waits for a person: Flow PT may hold the file, so it stays.
 */
export function dropUpload(queue: Queue, blobId: string): Entry[] | undefined {
	const mine = queue.filter((e) => isActive(e) && e.op.kind === 'blob' && e.op.blobId === blobId);
	if (mine.some((e) => !isOpen(e))) return undefined;
	return queue.filter((e) => !mine.includes(e));
}

// An optional field a site lacked is there now (#138, app/sync/waiting.ts).

/**
 * The queue once a field arrived: the key out of every unsent update of its table, an update left
 * with nothing dropped. Its base is what the device last saw, never what Flow PT held, which was
 * nothing: the refill sends the record's value instead (`refillOps`). A create goes as it is.
 */
export function refillQueue(queue: Queue, table: string, key: string): Entry[] {
	return queue.flatMap((e) => {
		const op = e.op;
		if (op.kind !== 'update' || op.table !== table || !(key in op.changes) || !(isOpen(e) || e.state === 'needsAttention')) return [e];
		const { [key]: _gone, ...changes } = op.changes;
		return Object.keys(changes).length ? [{ ...e, op: { ...op, changes } }] : [];
	});
}

/** The updates that send each record's value of a field that arrived, from no value in Flow PT. */
export function refillOps(table: string, key: string, rows: readonly ({ id: string } & Record<string, unknown>)[]): { op: Op; dependsOn: string[] }[] {
	return rows
		.filter((r) => r[key] !== undefined && r[key] !== null && r[key] !== '')
		.map((r) => ({ op: { kind: 'update', table, recordId: r.id, changes: { [key]: { base: undefined, value: r[key] } } }, dependsOn: [] }));
}
