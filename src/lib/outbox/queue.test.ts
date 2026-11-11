import { describe, expect, it } from 'vitest';
import { enqueue } from './queue';
import { blob, create, del, entry, fresh, update } from './testkit';
import type { CreateOp, Entry, UpdateOp } from './types';

const changes = (e: Entry) => (e.op as UpdateOp).changes;

describe('enqueue', () => {
	it('adds a pending entry with what was passed in', () => {
		const f = fresh(1000);
		const q = enqueue([], create('take', 't1', { take: '1' }), ['s1'], f);
		expect(q).toEqual([
			{
				id: f.id,
				seq: f.seq,
				op: create('take', 't1', { take: '1' }),
				dependsOn: ['s1'],
				state: 'pending',
				attempts: 0,
				createdAt: 1000
			}
		]);
	});

	it('does not touch the queue it was given', () => {
		const q: Entry[] = [];
		enqueue(q, create('take', 't1'), [], fresh());
		expect(q).toEqual([]);
	});
});

describe('enqueue an update', () => {
	it('merges into the unsent create of the same record', () => {
		const c = entry(create('take', 't1', { take: '1', notes: 'x' }), { dependsOn: ['s1'] });
		const q = enqueue([c], update('take', 't1', { tStop: [undefined, 4], notes: ['x', undefined] }), ['c1'], fresh());
		expect(q).toHaveLength(1);
		expect((q[0].op as CreateOp).fields).toEqual({ take: '1', tStop: 4 });
		expect(q[0].dependsOn).toEqual(['s1', 'c1']);
		expect(q[0].id).toBe(c.id);
	});

	it('merges successive edits of one field: first base, last value', () => {
		let q = enqueue([], update('take', 't1', { tStop: [2.8, 4] }), [], fresh());
		q = enqueue(q, update('take', 't1', { tStop: [4, 5.6] }), [], fresh());
		expect(q).toHaveLength(1);
		expect(changes(q[0])).toEqual({ tStop: { base: 2.8, value: 5.6 } });
	});

	it('merges edits of different fields of one record into one entry', () => {
		let q = enqueue([], update('take', 't1', { tStop: [2.8, 4] }), [], fresh());
		q = enqueue(q, update('take', 't1', { notes: [undefined, 'wide'] }), [], fresh());
		expect(q).toHaveLength(1);
		expect(changes(q[0])).toEqual({ tStop: { base: 2.8, value: 4 }, notes: { base: undefined, value: 'wide' } });
	});

	it('keeps edits of different records apart', () => {
		let q = enqueue([], update('take', 't1', { tStop: [2.8, 4] }), [], fresh());
		q = enqueue(q, update('take', 't2', { tStop: [2.8, 4] }), [], fresh());
		expect(q).toHaveLength(2);
	});

	it('an edit undone before it was sent leaves nothing', () => {
		let q = enqueue([], update('take', 't1', { tStop: [2.8, 4] }), [], fresh());
		q = enqueue(q, update('take', 't1', { tStop: [4, 2.8] }), [], fresh());
		expect(q).toEqual([]);
	});

	it('undoing one of two unsent fields keeps the other', () => {
		let q = enqueue([], update('take', 't1', { tStop: [2.8, 4], notes: [undefined, 'a'] }), [], fresh());
		q = enqueue(q, update('take', 't1', { notes: ['a', undefined] }), [], fresh());
		expect(changes(q[0])).toEqual({ tStop: { base: 2.8, value: 4 } });
	});

	it('compares values, not objects: the same length typed another way is no change', () => {
		const q = enqueue(
			[],
			update('take', 't1', { lensHeight: [{ m: 1.8288, entered: { text: "6'", system: 'imperial' } }, { m: 1.8288 }] }),
			[],
			fresh()
		);
		expect(q).toEqual([]);
	});

	it('drops a change that changes nothing and keeps the rest', () => {
		const q = enqueue([], update('take', 't1', { tStop: [4, 4], notes: ['a', 'b'] }), [], fresh());
		expect(changes(q[0])).toEqual({ notes: { base: 'a', value: 'b' } });
	});

	it.each(['inFlight', 'sentUnconfirmed', 'needsAttention'] as const)(
		'never merges into an entry that is %s: a new entry follows it',
		(state) => {
			const sent = entry(update('take', 't1', { tStop: [2.8, 4] }), { state, attempts: 1 });
			const q = enqueue([sent], update('take', 't1', { tStop: [4, 2.8] }), [], fresh());
			expect(q).toHaveLength(2);
			expect(q[0]).toBe(sent);
			expect(changes(q[1])).toEqual({ tStop: { base: 4, value: 2.8 } });
			expect(q[1].state).toBe('pending');
		}
	);

	it('merges into an entry that failed and waits for a retry, keeping its schedule', () => {
		const failed = entry(update('take', 't1', { tStop: [2.8, 4] }), {
			state: 'failedRetryable',
			attempts: 2,
			nextAttemptAt: 5000
		});
		const q = enqueue([failed], update('take', 't1', { tStop: [4, 8] }), [], fresh());
		expect(q).toHaveLength(1);
		expect(q[0]).toMatchObject({ state: 'failedRetryable', attempts: 2, nextAttemptAt: 5000 });
		expect(changes(q[0])).toEqual({ tStop: { base: 2.8, value: 8 } });
	});

	it('merges only into the last entry of the record', () => {
		const sent = entry(update('take', 't1', { tStop: [2.8, 4] }), { state: 'inFlight' });
		let q = enqueue([sent], update('take', 't1', { tStop: [4, 5.6] }), [], fresh());
		q = enqueue(q, update('take', 't1', { tStop: [5.6, 8] }), [], fresh());
		expect(q).toHaveLength(2);
		expect(changes(q[1])).toEqual({ tStop: { base: 4, value: 8 } });
	});

	it('a create in flight is not merged into', () => {
		const c = entry(create('take', 't1', { take: '1' }), { state: 'inFlight' });
		const q = enqueue([c], update('take', 't1', { take: ['1', '2'] }), [], fresh());
		expect(q).toHaveLength(2);
		expect((q[0].op as CreateOp).fields).toEqual({ take: '1' });
	});

	it('an upload queued after the create does not stop the merge into the create', () => {
		const c = entry(create('still', 'p1', { takeId: 't1' }));
		const b = entry(blob('p1'));
		const q = enqueue([c, b], update('still', 'p1', { caption: [undefined, 'slate'] }), [], fresh());
		expect(q).toHaveLength(2);
		expect((q[0].op as CreateOp).fields).toEqual({ takeId: 't1', caption: 'slate' });
	});
});

describe('enqueue a delete', () => {
	it('of a record never sent cancels everything queued for it', () => {
		const other = entry(create('take', 't2'));
		const q0 = [entry(create('still', 'p1')), entry(blob('p1')), other];
		expect(enqueue(q0, del('still', 'p1'), [], fresh())).toEqual([other]);
	});

	it('of a record the server has is queued, after its unsent edits', () => {
		const u = entry(update('take', 't1', { tStop: [2.8, 4] }));
		const q = enqueue([u], del('take', 't1'), [], fresh());
		expect(q.map((e) => e.op.kind)).toEqual(['update', 'delete']);
	});

	it('drops the unsent uploads of the record, keeps the ones under way', () => {
		const sending = entry(blob('p1', 'b1'), { state: 'inFlight' });
		const waiting = entry(blob('p1', 'b2'));
		const q = enqueue([sending, waiting], del('still', 'p1'), [], fresh());
		expect(q.map((e) => e.op.kind)).toEqual(['blob', 'delete']);
		expect(q[0]).toBe(sending);
	});

	it('of a record whose create is in flight is queued behind it', () => {
		const c = entry(create('take', 't1'), { state: 'inFlight' });
		const q = enqueue([c], del('take', 't1'), [], fresh());
		expect(q.map((e) => e.op.kind)).toEqual(['create', 'delete']);
	});

	it('is queued once', () => {
		let q = enqueue([], del('take', 't1'), [], fresh());
		q = enqueue(q, del('take', 't1'), [], fresh());
		expect(q).toHaveLength(1);
	});
});

describe('enqueue a create', () => {
	it('cancels an unsent delete of the same record: the record is back', () => {
		const u = entry(update('take', 't1', { tStop: [2.8, 4] }));
		let q = enqueue([u], del('take', 't1'), [], fresh());
		q = enqueue(q, create('take', 't1', { tStop: 4 }), [], fresh());
		expect(q).toEqual([u]);
	});

	it('follows a delete that was sent', () => {
		const d = entry(del('take', 't1'), { state: 'sentUnconfirmed' });
		const q = enqueue([d], create('take', 't1', {}), [], fresh());
		expect(q.map((e) => e.op.kind)).toEqual(['delete', 'create']);
	});
});

describe('enqueue an upload', () => {
	it('is always its own entry and waits for its record', () => {
		let q = enqueue([], blob('p1', 'b1'), ['p1'], fresh());
		q = enqueue(q, blob('p1', 'b2'), ['p1'], fresh());
		expect(q).toHaveLength(2);
		expect(q[0].dependsOn).toEqual(['p1']);
	});
});
