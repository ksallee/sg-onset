import { describe, expect, it } from 'vitest';
import { applyServerRead, checkUpdate, resolveConflict, verdict } from './conflict';
import { create, entry, update } from './testkit';
import type { UpdateOp } from './types';

describe('verdict', () => {
	it.each([
		// base, local, server, verdict
		[2.8, 4, 2.8, 'send'],
		[2.8, 4, 4, 'same'],
		[2.8, 4, 5.6, 'conflict'],
		[undefined, 'a', undefined, 'send'],
		[undefined, 'a', null, 'send'],
		[undefined, 'a', 'b', 'conflict'],
		['a', undefined, 'a', 'send'],
		['a', undefined, undefined, 'same'],
		['a', undefined, 'b', 'conflict'],
		[{ m: 1 }, { m: 2 }, { m: 1, entered: { text: '1m' } }, 'send'],
		[{ m: 1 }, { m: 2 }, { m: 2, entered: { text: '2m' } }, 'same'],
		[['a'], ['a', 'b'], ['a'], 'send'],
		[['a'], ['a', 'b'], ['b'], 'conflict']
	])('base %j, ours %j, server %j: %s', (base, value, server, expected) => {
		expect(verdict({ base, value }, server)).toBe(expected);
	});
});

describe('checkUpdate', () => {
	it('sorts the fields into what to send and what conflicts', () => {
		const changes = {
			tStop: { base: 2.8, value: 4 },
			notes: { base: 'a', value: 'b' },
			iso: { base: 800, value: 1600 }
		};
		expect(checkUpdate(changes, { tStop: 2.8, notes: 'b', iso: 400 })).toEqual({
			send: { tStop: { base: 2.8, value: 4 } },
			conflicts: [{ key: 'iso', base: 800, local: 1600, server: 400 }]
		});
	});
});

describe('applyServerRead', () => {
	const u = () => entry(update('take', 't1', { tStop: [2.8, 4], notes: ['a', 'b'] }));

	it('leaves the entry as it is when the server still holds the base values', () => {
		const e = u();
		expect(applyServerRead([e], e.id, { tStop: 2.8, notes: 'a' })[0]).toBe(e);
	});

	it('drops the fields the server already has', () => {
		const e = u();
		const next = applyServerRead([e], e.id, { tStop: 4, notes: 'a' });
		expect((next[0].op as UpdateOp).changes).toEqual({ notes: { base: 'a', value: 'b' } });
		expect(next[0].state).toBe('pending');
	});

	it('confirms the entry when the server already has every value', () => {
		const e = u();
		expect(applyServerRead([e], e.id, { tStop: 4, notes: 'b' })[0].state).toBe('confirmed');
	});

	it('surfaces a conflict and holds the whole entry: nothing is sent, nothing is dropped', () => {
		const e = u();
		const next = applyServerRead([e], e.id, { tStop: 5.6, notes: 'a' });
		expect(next[0]).toMatchObject({
			state: 'needsAttention',
			attention: { reason: 'conflict', conflicts: [{ key: 'tStop', base: 2.8, local: 4, server: 5.6 }] }
		});
		expect(next[0].op).toEqual(e.op);
	});

	it('flags a record the server no longer has', () => {
		const e = u();
		expect(applyServerRead([e], e.id, undefined)[0]).toMatchObject({
			state: 'needsAttention',
			attention: { reason: 'gone' }
		});
	});

	it('only looks at unsent updates', () => {
		const c = entry(create('take', 't1'));
		const flying = entry(update('take', 't2', { a: [1, 2] }), { state: 'inFlight' });
		const next = applyServerRead(applyServerRead([c, flying], c.id, undefined), flying.id, { a: 9 });
		expect(next).toEqual([c, flying]);
	});
});

describe('resolveConflict', () => {
	const conflicted = () => {
		const e = entry(update('take', 't1', { tStop: [2.8, 4], iso: [800, 1600], notes: ['a', 'b'] }), { attempts: 2 });
		return applyServerRead([e], e.id, { tStop: 5.6, iso: 400, notes: 'a' });
	};

	it('keeping ours rebases on the server value and queues the entry again', () => {
		const q = conflicted();
		const { queue, local } = resolveConflict(q, q[0].id, () => 'mine');
		expect(queue[0]).toMatchObject({ state: 'pending', attempts: 0 });
		expect(queue[0].attention).toBeUndefined();
		expect((queue[0].op as UpdateOp).changes).toEqual({
			tStop: { base: 5.6, value: 4 },
			iso: { base: 400, value: 1600 },
			notes: { base: 'a', value: 'b' }
		});
		expect(local).toEqual([]);
	});

	it('taking theirs drops the field from the entry and returns the local change to make', () => {
		const q = conflicted();
		const { queue, local } = resolveConflict(q, q[0].id, (c) => (c.key === 'iso' ? 'theirs' : 'mine'));
		expect((queue[0].op as UpdateOp).changes).toEqual({
			tStop: { base: 5.6, value: 4 },
			notes: { base: 'a', value: 'b' }
		});
		expect(local).toEqual([{ id: 't1', key: 'iso', from: 1600, to: 400 }]);
	});

	it('taking theirs for every field of the entry removes it', () => {
		const e = entry(update('take', 't1', { tStop: [2.8, 4] }));
		const q = applyServerRead([e], e.id, { tStop: 5.6 });
		const { queue, local } = resolveConflict(q, e.id, () => 'theirs');
		expect(queue).toEqual([]);
		expect(local).toEqual([{ id: 't1', key: 'tStop', from: 4, to: 5.6 }]);
	});

	it('does nothing to an entry that is not in conflict', () => {
		const e = entry(update('take', 't1', { tStop: [2.8, 4] }));
		expect(resolveConflict([e], e.id, () => 'theirs')).toEqual({ queue: [e], local: [] });
	});
});
