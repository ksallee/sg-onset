import { describe, expect, it } from 'vitest';
import { blockers, levels } from './levels';
import { blob, create, del, entry, update } from './testkit';
import type { Entry } from './types';

const levelList = (queue: Entry[]) => {
	const map = levels(queue);
	return queue.map((e) => map.get(e.id));
};

describe('levels', () => {
	it('puts parents before children, one level each', () => {
		const q = [
			entry(create('take', 't1'), { dependsOn: ['s1', 'c1'] }),
			entry(create('slate', 's1'), { dependsOn: ['d1'] }),
			entry(create('shootDay', 'd1'), { dependsOn: ['p1'] }),
			entry(create('project', 'p1')),
			entry(create('camera', 'c1'), { dependsOn: ['p1'] })
		];
		expect(levelList(q)).toEqual([3, 2, 1, 0, 1]);
	});

	it('a dependency the queue has no create for is on the server already', () => {
		const q = [entry(create('take', 't1'), { dependsOn: ['s1'] }), entry(update('slate', 's1', { slate: ['1', '2'] }))];
		expect(levelList(q)).toEqual([0, 0]);
	});

	it('puts a record before its files', () => {
		const q = [entry(blob('p1'), { dependsOn: ['p1'] }), entry(create('still', 'p1'), { dependsOn: ['t1'] })];
		expect(levelList(q)).toEqual([1, 0]);
	});

	it('keeps the entries of one record in order', () => {
		const q = [
			entry(update('take', 't1', { a: [1, 2] }), { state: 'inFlight' }),
			entry(update('take', 't1', { a: [2, 3] })),
			entry(del('take', 't1'))
		];
		expect(levelList(q)).toEqual([0, 1, 2]);
	});

	it('an update linking to a new record waits for it', () => {
		const q = [entry(update('take', 't1', { lensId: ['l1', 'l2'] }), { dependsOn: ['l2'] }), entry(create('lens', 'l2'))];
		expect(levelList(q)).toEqual([1, 0]);
	});

	it('a create that needs attention still holds its children back', () => {
		const q = [
			entry(create('slate', 's1'), { state: 'needsAttention', attention: { reason: 'refused' } }),
			entry(create('take', 't1'), { dependsOn: ['s1'] })
		];
		expect(levelList(q)).toEqual([0, 1]);
	});

	it('ignores confirmed entries', () => {
		const q = [entry(create('slate', 's1'), { state: 'confirmed' }), entry(create('take', 't1'), { dependsOn: ['s1'] })];
		expect(levels(q).get(q[1].id)).toBe(0);
		expect(levels(q).has(q[0].id)).toBe(false);
	});

	it('survives a cycle', () => {
		const q = [entry(create('a', 'a1'), { dependsOn: ['b1'] }), entry(create('b', 'b1'), { dependsOn: ['a1'] })];
		expect(levelList(q).every((n) => typeof n === 'number')).toBe(true);
	});

	it('handles a long chain of edits without recursion trouble', () => {
		const q = Array.from({ length: 5000 }, () => entry(blob('p1', 'b'), { state: 'inFlight' }));
		expect(levels(q).get(q[4999].id)).toBe(4999);
	});
});

describe('blockers', () => {
	it('lists what an entry waits for', () => {
		const parent = entry(create('slate', 's1'));
		const earlier = entry(update('take', 't1', { a: [1, 2] }), { state: 'inFlight' });
		const later = entry(update('take', 't1', { a: [2, 3] }), { dependsOn: ['s1'] });
		expect(blockers([parent, earlier, later], later)).toEqual([parent, earlier]);
		expect(blockers([parent, earlier, later], earlier)).toEqual([]);
	});
});
