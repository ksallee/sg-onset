import { describe, expect, it } from 'vitest';
import { planBatch } from './plan';
import { blob, create, entry, update } from './testkit';

const cap = { maxOps: 25 };
const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('planBatch', () => {
	it('takes one dependency level: the entries nothing holds back', () => {
		const project = entry(create('project', 'p1'));
		const day = entry(create('shootDay', 'd1'), { dependsOn: ['p1'] });
		const camera = entry(create('camera', 'c1'), { dependsOn: ['p1'] });
		const other = entry(create('project', 'p2'));
		const plan = planBatch([day, project, camera, other], 0, cap);
		expect(ids(plan.ops)).toEqual(ids([project, other]));
	});

	it('orders by arrival and stops at the cap', () => {
		const q = Array.from({ length: 7 }, (_, i) => entry(create('project', `p${i}`)));
		const plan = planBatch([...q].reverse(), 0, { maxOps: 3 });
		expect(ids(plan.ops)).toEqual(ids(q.slice(0, 3)));
	});

	it('skips what is in flight, unconfirmed, confirmed or needs attention', () => {
		const q = [
			entry(create('project', 'p1'), { state: 'inFlight' }),
			entry(create('project', 'p2'), { state: 'sentUnconfirmed', nextAttemptAt: 99 }),
			entry(create('project', 'p3'), { state: 'confirmed' }),
			entry(create('project', 'p4'), { state: 'needsAttention' }),
			entry(create('project', 'p5'))
		];
		expect(ids(planBatch(q, 0, cap).ops)).toEqual([q[4].id]);
	});

	it('takes a failed entry only when its time has come', () => {
		const failed = entry(create('project', 'p1'), { state: 'failedRetryable', nextAttemptAt: 1000 });
		expect(planBatch([failed], 999, cap)).toMatchObject({ ops: [], waitUntil: 1000 });
		expect(ids(planBatch([failed], 1000, cap).ops)).toEqual([failed.id]);
		expect(planBatch([failed], 1000, cap).waitUntil).toBeUndefined();
	});

	it('keeps uploads out of the batch and offers one at a time, oldest first', () => {
		const b1 = entry(blob('p1', 'b1'));
		const b2 = entry(blob('p2', 'b2'));
		const u = entry(update('take', 't1', { a: [1, 2] }));
		const plan = planBatch([b2, b1, u], 0, cap);
		expect(ids(plan.ops)).toEqual([u.id]);
		expect(plan.blob?.id).toBe(b1.id);
	});

	it('does not offer an upload whose record is not on the server yet', () => {
		const c = entry(create('still', 'p1'));
		const b = entry(blob('p1'), { dependsOn: ['p1'] });
		expect(planBatch([c, b], 0, cap).blob).toBeUndefined();
	});

	it('lists the unconfirmed entries that are due for a check, up to the cap', () => {
		const due = entry(create('project', 'p1'), { state: 'sentUnconfirmed', nextAttemptAt: 10 });
		const later = entry(create('project', 'p2'), { state: 'sentUnconfirmed', nextAttemptAt: 50 });
		const plan = planBatch([due, later], 10, cap);
		expect(ids(plan.unconfirmed)).toEqual([due.id]);
		expect(plan.waitUntil).toBe(50);
		const many = Array.from({ length: 5 }, (_, i) => entry(create('project', `q${i}`), { state: 'sentUnconfirmed' }));
		expect(planBatch(many, 0, { maxOps: 2 }).unconfirmed).toHaveLength(2);
	});

	it('waits for the earliest of what is scheduled', () => {
		const q = [
			entry(create('project', 'p1'), { state: 'failedRetryable', nextAttemptAt: 300 }),
			entry(create('project', 'p2'), { state: 'sentUnconfirmed', nextAttemptAt: 200 })
		];
		expect(planBatch(q, 0, cap).waitUntil).toBe(200);
	});

	it('has nothing to do on an empty queue', () => {
		expect(planBatch([], 0, cap)).toEqual({ ops: [], unconfirmed: [] });
	});
});
