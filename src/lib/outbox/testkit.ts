// Builders for the outbox tests.

import type { Entry, EntryState, Fresh, Op } from './types';

let counter = 0;

/** A fresh id, seq and time; seq rises with every call. */
export function fresh(now = 0): Fresh {
	counter += 1;
	return { id: `e${counter}`, seq: counter, now };
}

export function entry(op: Op, rest: Partial<Omit<Entry, 'op'>> = {}): Entry {
	const f = fresh();
	return { id: f.id, seq: f.seq, op, dependsOn: [], state: 'pending', attempts: 0, createdAt: 0, ...rest };
}

export const create = (table: string, recordId: string, fields: Record<string, unknown> = {}): Op => ({
	kind: 'create',
	table,
	recordId,
	fields
});

/** `changes` as `{ key: [base, value] }`. */
export const update = (table: string, recordId: string, changes: Record<string, [unknown, unknown]>): Op => ({
	kind: 'update',
	table,
	recordId,
	changes: Object.fromEntries(Object.entries(changes).map(([k, [base, value]]) => [k, { base, value }]))
});

export const del = (table: string, recordId: string): Op => ({ kind: 'delete', table, recordId });

export const blob = (recordId: string, blobId = recordId, size = 10): Op => ({
	kind: 'blob',
	table: 'still',
	recordId,
	blobId,
	size,
	type: 'image/jpeg'
});

export const states = (queue: readonly Entry[]): EntryState[] => queue.map((e) => e.state);
