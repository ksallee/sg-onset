import { describe, expect, it } from 'vitest';
import type { Entry, Op } from '$lib/outbox/types';
import { elsewhereCount, splitWaiting, waitingTables, waits } from './waiting';

const entry = (id: string, seq: number, op: Op, extra: Partial<Entry> = {}): Entry => ({ id, seq, op, dependsOn: [], state: 'pending', attempts: 0, createdAt: seq, ...extra });
const create = (table: string, recordId: string): Op => ({ kind: 'create', table, recordId, fields: {} });
const update = (table: string, recordId: string): Op => ({ kind: 'update', table, recordId, changes: {} });
const blob = (recordId: string): Op => ({ kind: 'blob', table: 'still', recordId, blobId: `b-${recordId}`, size: 10, type: 'image/jpeg' });

// Kevin, #117: Set Reference is optional. On a site without it the references wait on the device.
describe('waitingTables', () => {
	it('holds the set references back on a site without Set Reference, and nothing otherwise', () => {
		expect(waitingTables({ referencesMissing: true })).toEqual(['reference']);
		expect(waitingTables({ referencesMissing: false })).toEqual([]);
		expect(waitingTables({})).toEqual([]);
	});

	// A Set Shot is no record on the device: nothing of the queue waits for it.
	it('holds nothing back for Set Shot', () => {
		expect(waitingTables({ setShotsMissing: true })).toEqual([]);
	});
});

describe('splitWaiting', () => {
	const queue = [
		entry('1', 1, create('slate', 's1')),
		entry('2', 2, create('reference', 'r1')),
		entry('3', 3, create('take', 't1')),
		entry('4', 4, update('reference', 'r2'), { state: 'failedRetryable' }),
		entry('5', 5, blob('ph1'))
	];

	it('keeps every entry of a table that waits out of what the runner may send, in order, and drops none', () => {
		const { open, waiting } = splitWaiting(queue, ['reference']);
		expect(open.map((e) => e.id)).toEqual(['1', '3', '5']);
		expect(waiting.map((e) => e.id)).toEqual(['2', '4']);
	});

	it('lets everything through when nothing waits', () => {
		expect(splitWaiting(queue, [])).toEqual({ open: queue, waiting: [] });
		expect(queue.some((e) => waits(e, []))).toBe(false);
	});

	it('tells an entry that waits by its table, whatever its kind or state', () => {
		expect(queue.filter((e) => waits(e, ['reference'])).map((e) => e.op.kind)).toEqual(['create', 'update']);
	});
});

describe('elsewhereCount', () => {
	const counts = (entries: number) => ({ entries, records: entries, blobs: 0, attention: 0 });

	it('counts the changes of other projects, never what waits in this one for an entity', () => {
		expect(elsewhereCount(counts(7), counts(3), counts(2))).toBe(2);
		expect(elsewhereCount(counts(5), counts(3), undefined)).toBe(2);
		expect(elsewhereCount(counts(5), counts(5), counts(0))).toBe(0);
	});

	it('counts nothing before the project is counted, and never below nothing', () => {
		expect(elsewhereCount(counts(4), undefined, undefined)).toBe(0);
		expect(elsewhereCount(undefined, undefined, undefined)).toBe(0);
		expect(elsewhereCount(counts(2), counts(3), counts(1))).toBe(0);
	});
});
