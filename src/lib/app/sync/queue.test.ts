import { describe, expect, it } from 'vitest';
import type { Entry, Op } from '$lib/outbox/types';
import { tk } from '$lib/i18n/messages';
import { conflictLines, entryParent, parentOf, pendingByKind, scopedUpdate } from './queue';

const entry = (id: string, seq: number, op: Op, extra: Partial<Entry> = {}): Entry => ({ id, seq, op, dependsOn: [], state: 'pending', attempts: 0, createdAt: seq, ...extra });
const create = (table: string, recordId: string, fields: Record<string, unknown> = {}): Op => ({ kind: 'create', table, recordId, fields });
const update = (table: string, recordId: string): Op => ({ kind: 'update', table, recordId, changes: {} });
const blob = (recordId: string): Op => ({ kind: 'blob', table: 'still', recordId, blobId: `b-${recordId}`, size: 10, type: 'image/jpeg' });

describe('pendingByKind', () => {
	it('counts what waits by kind of record, in the model order, photos last, and leaves out what needs a person', () => {
		const queue = [
			entry('1', 1, create('take', 't1')),
			entry('2', 2, update('take', 't2')),
			entry('3', 3, create('slate', 's1')),
			entry('4', 4, blob('ph1')),
			entry('5', 5, create('still', 'ph1')),
			entry('6', 6, update('take', 't3'), { state: 'needsAttention', attention: { reason: 'gone' } }),
			entry('7', 7, create('project', 'p1'))
		];
		expect(pendingByKind(queue)).toEqual([
			{ kind: 'project', count: 1 },
			{ kind: 'slate', count: 1 },
			{ kind: 'take', count: 2 },
			{ kind: 'still', count: 1 },
			{ kind: 'file', count: 1 }
		]);
	});
	it('says nothing on an empty queue', () => {
		expect(pendingByKind([])).toEqual([]);
	});
});

describe('scopedUpdate', () => {
	it('runs the change on the entries in scope only and keeps the rest as they were, in order', () => {
		const queue = [entry('a', 1, create('take', 't1')), entry('b', 2, create('take', 'x1')), entry('c', 3, create('take', 't2'))];
		const seen: string[][] = [];
		const run = scopedUpdate(
			(q) => {
				seen.push(q.map((e) => e.id));
				return q.map((e) => ({ ...e, state: 'inFlight' as const }));
			},
			(e) => e.op.recordId.startsWith('t')
		);
		const out = run(queue);
		expect(seen).toEqual([['a', 'c']]);
		expect(out.map((e) => [e.id, e.state])).toEqual([
			['a', 'inFlight'],
			['b', 'pending'],
			['c', 'inFlight']
		]);
		expect(out[1]).toBe(queue[1]);
	});
	it('lets the change drop entries of its scope', () => {
		const queue = [entry('a', 1, create('take', 't1')), entry('b', 2, create('take', 'x1'))];
		expect(scopedUpdate(() => [], (e) => e.id === 'a')(queue).map((e) => e.id)).toEqual(['b']);
	});
});

describe('entryParent', () => {
	it('reads the parent from the record a create carries', () => {
		expect(entryParent(entry('1', 1, create('take', 't1', { slateId: 's1' })))).toEqual({ table: 'slate', id: 's1' });
		expect(entryParent(entry('1', 1, create('camera', 'c1', { projectId: 'p1' })))).toEqual({ table: 'project', id: 'p1' });
		expect(entryParent(entry('1', 1, create('still', 'ph1', { takeId: 't1' })))).toEqual({ table: 'take', id: 't1' });
	});
	it('knows none for a project, an update, a delete, a file or an unknown table', () => {
		expect(entryParent(entry('1', 1, create('project', 'p1')))).toBeUndefined();
		expect(entryParent(entry('1', 1, update('take', 't1')))).toBeUndefined();
		expect(entryParent(entry('1', 1, blob('ph1')))).toBeUndefined();
		expect(entryParent(entry('1', 1, create('nope', 'n1', { projectId: 'p1' })))).toBeUndefined();
	});
});

describe('parentOf', () => {
	it('reads the parent key of a stored record', () => {
		expect(parentOf('slate', { id: 's1', shootDayId: 'd1' })).toEqual({ table: 'shootDay', id: 'd1' });
		expect(parentOf('project', { id: 'p1' })).toBeUndefined();
		expect(parentOf('slate', { id: 's1' })).toBeUndefined();
	});
});

describe('conflictLines', () => {
	it('shows each field by its label, both values formatted in the units of the device', () => {
		const lines = conflictLines('take', [
			{ key: 'tStop', base: 2.8, local: 4, server: 5.6 },
			{ key: 'lensHeight', base: undefined, local: { m: 1.5 }, server: undefined },
			{ key: 'circleTake', base: undefined, local: true, server: undefined },
			{ key: 'focalLengthEnd', base: 50, local: 75, server: 85 }
		], 'metric');
		expect(lines).toEqual([
			{ key: 'tStop', label: tk('field.take.tStop'), mine: '4', theirs: '5.6' },
			{ key: 'lensHeight', label: tk('field.take.lensHeight'), mine: '1.5 m', theirs: tk('sync.conflict.empty') },
			{ key: 'circleTake', label: tk('field.take.circleTake'), mine: tk('common.yes'), theirs: tk('common.no') },
			{ key: 'focalLengthEnd', label: tk('field.end', { field: tk('field.take.focalLength') }), mine: '75 mm', theirs: '85 mm' }
		]);
	});
	it('shows a key the catalogue does not know as it is', () => {
		expect(conflictLines('take', [{ key: 'mystery', base: 1, local: 2, server: 3 }], 'metric')).toEqual([{ key: 'mystery', label: 'mystery', mine: '2', theirs: '3' }]);
	});
});
