import { describe, expect, it } from 'vitest';
import { blob, create, del, entry, update } from '$lib/outbox/testkit';
import type { Entry } from '$lib/outbox/types';
import type { BlobMeta } from '../types';
import { diffTables, planRestore, type Side, type Row } from './reconcile';

const project: Row = { id: 'p1', name: 'Show' };
const day: Row = { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' };
const slate: Row = { id: 's1', shootDayId: 'd1', slateUID: '12A' };
const take: Row = { id: 't1', slateId: 's1', take: '1', tStop: 2.8 };

function side(rows: Record<string, Row[]>, rest: Partial<Side> = {}): Side {
	return { tables: rows, trash: [], blobs: [], ...rest };
}

function current(rows: Record<string, Row[]>, rest: Partial<Side> & { queue?: Entry[]; remotes?: string[] } = {}) {
	return { ...side(rows, rest), queue: rest.queue ?? [], remotes: new Set(rest.remotes ?? []) };
}

const all = { project: [project], shootDay: [day], slate: [slate], take: [take] };
const synced = ['p1', 'd1', 's1', 't1'];
const ops = (plan: ReturnType<typeof planRestore>) => plan.ops.map((o) => `${o.op.kind} ${o.op.recordId}`);

function meta(id: string, recordId: string, rest: Partial<BlobMeta> = {}): BlobMeta {
	return { id, table: 'still', recordId, type: 'image/jpeg', size: 10, createdAt: 0, ...rest };
}

describe('planRestore', () => {
	it('queues nothing when nothing changed and everything is on Flow PT', () => {
		const plan = planRestore(side(all), current(all, { remotes: synced }));
		expect(plan.ops).toEqual([]);
		expect(plan.queue).toEqual([]);
	});

	it('sends the snapshot’s values back over a change that was synced since', () => {
		const now = { ...all, take: [{ ...take, tStop: 4, notes: 'later' }] };
		const plan = planRestore(side(all), current(now, { remotes: synced }));
		expect(plan.ops).toEqual([
			{
				op: { kind: 'update', table: 'take', recordId: 't1', changes: { tStop: { base: 4, value: 2.8 }, notes: { base: 'later', value: undefined } } },
				dependsOn: []
			}
		]);
	});

	it('drops an unsent change: Flow PT never saw it, and the record goes back to what it holds', () => {
		const now = { ...all, take: [{ ...take, tStop: 4 }] };
		const queue = [entry(update('take', 't1', { tStop: [2.8, 4] }))];
		const plan = planRestore(side(all), current(now, { remotes: synced, queue }));
		expect(plan.ops).toEqual([]);
		expect(plan.queue).toEqual([]);
	});

	it('uses the base of an unsent change as what Flow PT holds', () => {
		// Synced at 4 after the snapshot, then 5.6 typed and not sent.
		const now = { ...all, take: [{ ...take, tStop: 5.6 }] };
		const queue = [entry(update('take', 't1', { tStop: [4, 5.6] }))];
		const plan = planRestore(side(all), current(now, { remotes: synced, queue }));
		expect(plan.ops.map((o) => o.op)).toEqual([{ kind: 'update', table: 'take', recordId: 't1', changes: { tStop: { base: 4, value: 2.8 } } }]);
	});

	it('keeps entries that were sent or wait for a person: they settle on their own', () => {
		const sent = entry(update('take', 't1', { tStop: [2.8, 4] }), { state: 'sentUnconfirmed', attempts: 1 });
		const stuck = entry(update('slate', 's1', { slateUID: ['12A', '12B'] }), { state: 'needsAttention', attention: { reason: 'refused' } });
		const flying = entry(update('shootDay', 'd1', { location: [undefined, 'Studio'] }), { state: 'inFlight', attempts: 1 });
		const now = { ...all, take: [{ ...take, tStop: 4 }], slate: [{ ...slate, slateUID: '12B' }], shootDay: [{ ...day, location: 'Studio' }] };
		const plan = planRestore(side(all), current(now, { remotes: synced, queue: [sent, stuck, flying] }));
		expect(plan.queue).toEqual([sent, stuck, flying]);
		expect(ops(plan).sort()).toEqual(['update d1', 'update s1', 'update t1']);
		const t = plan.ops.find((o) => o.op.recordId === 't1')!.op;
		expect(t).toMatchObject({ changes: { tStop: { base: 4, value: 2.8 } } });
	});

	describe('a record created after the snapshot', () => {
		const later: Row = { id: 't2', slateId: 's1', take: '2' };
		const now = { ...all, take: [take, later] };

		it('and synced: is deleted on Flow PT, and kept in the trash', () => {
			const plan = planRestore(side(all), current(now, { remotes: [...synced, 't2'] }));
			expect(plan.ops).toEqual([{ op: { kind: 'delete', table: 'take', recordId: 't2' }, dependsOn: [] }]);
			expect(plan.tables.take.map((r) => r.id)).toEqual(['t1']);
			expect(plan.trash).toEqual([{ id: 't2', table: 'take', record: later, deletedAt: 0 }]);
		});

		it('and never sent: its create is dropped and nothing goes', () => {
			const queue = [entry(create('take', 't2', { slateId: 's1', take: '2' }), { dependsOn: ['s1'] })];
			const plan = planRestore(side(all), current(now, { remotes: synced, queue }));
			expect(plan.ops).toEqual([]);
			expect(plan.queue).toEqual([]);
			expect(plan.trash).toEqual([]);
		});

		it('with its create in flight: the create stays and a delete follows it', () => {
			const flying = entry(create('take', 't2', { slateId: 's1', take: '2' }), { state: 'sentUnconfirmed', attempts: 1 });
			const plan = planRestore(side(all), current(now, { remotes: synced, queue: [flying] }));
			expect(plan.queue).toEqual([flying]);
			expect(ops(plan)).toEqual(['delete t2']);
		});
	});

	describe('a record deleted after the snapshot', () => {
		const now = { project: [project], shootDay: [day], slate: [slate], take: [] };

		it('with the delete confirmed: is created again, whole', () => {
			// Confirmed: gone from the trash, the queue and the server ids.
			const plan = planRestore(side(all), current(now, { remotes: ['p1', 'd1', 's1'] }));
			expect(plan.ops).toEqual([{ op: { kind: 'create', table: 'take', recordId: 't1', fields: { slateId: 's1', take: '1', tStop: 2.8 } }, dependsOn: ['s1'] }]);
			expect(plan.tables.take).toEqual([take]);
		});

		it('with the delete sent and not confirmed: the delete stays, a create follows', () => {
			const gone = entry(del('take', 't1'), { state: 'sentUnconfirmed', attempts: 1 });
			const trash = [{ id: 't1', table: 'take' as const, record: take, deletedAt: 5 }];
			const plan = planRestore(side(all), current(now, { remotes: synced, queue: [gone], trash }));
			expect(plan.queue).toEqual([gone]);
			expect(ops(plan)).toEqual(['create t1']);
			expect(plan.trash).toEqual([]);
		});

		it('with the delete unsent: the delete is dropped and nothing goes', () => {
			const queued = entry(del('take', 't1'));
			const trash = [{ id: 't1', table: 'take' as const, record: take, deletedAt: 5 }];
			const plan = planRestore(side(all), current(now, { remotes: synced, queue: [queued], trash }));
			expect(plan.queue).toEqual([]);
			expect(plan.ops).toEqual([]);
			expect(plan.trash).toEqual([]);
		});
	});

	it('creates again what the snapshot holds and Flow PT never had, with the snapshot’s values', () => {
		const now = { ...all, take: [{ ...take, tStop: 8 }] };
		const queue = [entry(create('take', 't1', { slateId: 's1', take: '1', tStop: 8 }), { dependsOn: ['s1'] })];
		const plan = planRestore(side(all), current(now, { remotes: ['p1', 'd1', 's1'], queue }));
		expect(plan.queue).toEqual([]);
		expect(plan.ops.map((o) => o.op)).toEqual([{ kind: 'create', table: 'take', recordId: 't1', fields: { slateId: 's1', take: '1', tStop: 2.8 } }]);
	});

	it('brings templates back with the snapshot and queues nothing for them: they stay on the device', () => {
		const template: Row = { id: 'tp1', projectId: 'p1', name: 'Day ext', scope: 'take', values: { tStop: 2.8 } };
		const plan = planRestore(side({ ...all, template: [template] }), current(all, { remotes: synced }));
		expect(plan.tables.template).toEqual([template]);
		expect(plan.ops).toEqual([]);
	});

	it('queues parents before children', () => {
		const plan = planRestore(side(all), current({}, {}));
		expect(ops(plan)).toEqual(['create p1', 'create d1', 'create s1', 'create t1']);
	});

	it('deletes a record the snapshot had in its trash and that came back and synced since', () => {
		const snapTrash = [{ id: 't1', table: 'take' as const, record: take, deletedAt: 1 }];
		const before = { ...all, take: [] };
		const plan = planRestore(side(before, { trash: snapTrash }), current(all, { remotes: synced }));
		expect(ops(plan)).toEqual(['delete t1']);
		expect(plan.trash).toEqual([{ id: 't1', table: 'take', record: take, deletedAt: 1 }]);
	});

	describe('photos', () => {
		const still: Row = { id: 'ph1', takeId: 't1', capturedAt: 'x' };

		it('a photo added after the snapshot and never sent leaves with all its entries; its bytes are not the plan’s', () => {
			const now = { ...all, still: [still] };
			const queue = [entry(create('still', 'ph1', { takeId: 't1' }), { dependsOn: ['t1'] }), entry(blob('ph1', 'b1'), { dependsOn: ['ph1'] })];
			const plan = planRestore(side(all), current(now, { remotes: synced, queue, blobs: [meta('b1', 'ph1')] }));
			expect(plan.ops).toEqual([]);
			expect(plan.queue).toEqual([]);
			expect(plan.blobs).toEqual([]);
			expect(plan.tables.still ?? []).toEqual([]);
		});

		it('a photo added after the snapshot and synced: its record is deleted on Flow PT', () => {
			const now = { ...all, still: [still] };
			const plan = planRestore(side(all), current(now, { remotes: [...synced, 'ph1'], blobs: [meta('b1', 'ph1', { verifiedAt: 9 })] }));
			expect(ops(plan)).toEqual(['delete ph1']);
		});

		it('a photo in the snapshot that Flow PT holds is not uploaded again; what we learnt since is kept', () => {
			const withPhoto = { ...all, still: [still] };
			const plan = planRestore(
				side(withPhoto, { blobs: [meta('b1', 'ph1')] }),
				current(withPhoto, { remotes: [...synced, 'ph1'], blobs: [meta('b1', 'ph1', { verifiedAt: 9, remoteId: 77, prunedAt: 20 })] })
			);
			expect(plan.ops).toEqual([]);
			expect(plan.blobs).toEqual([meta('b1', 'ph1', { verifiedAt: 9, remoteId: 77, prunedAt: 20 })]);
		});

		it('a photo in the snapshot not verified and not queued is queued again', () => {
			const withPhoto = { ...all, still: [still] };
			const plan = planRestore(side(withPhoto, { blobs: [meta('b1', 'ph1')] }), current(all, { remotes: synced }));
			expect(ops(plan)).toEqual(['create ph1', 'blob ph1']);
			expect(plan.ops[1]).toEqual({ op: { kind: 'blob', table: 'still', recordId: 'ph1', blobId: 'b1', size: 10, type: 'image/jpeg' }, dependsOn: ['ph1'] });
		});

		it('a photo whose upload is in flight is not queued twice', () => {
			const withPhoto = { ...all, still: [still] };
			const up = entry(blob('ph1', 'b1'), { state: 'sentUnconfirmed', attempts: 1 });
			const plan = planRestore(side(withPhoto, { blobs: [meta('b1', 'ph1')] }), current(withPhoto, { remotes: [...synced, 'ph1'], queue: [up], blobs: [meta('b1', 'ph1')] }));
			expect(plan.ops).toEqual([]);
			expect(plan.queue).toEqual([up]);
		});
	});
});

describe('diffTables', () => {
	it('counts records added, removed and changed per table, from now to the snapshot', () => {
		const now = { ...all, take: [{ ...take, tStop: 4 }, { id: 't2', slateId: 's1' }], slate: [] };
		expect(diffTables(all, now)).toEqual({ take: { added: 0, removed: 1, changed: 1 }, slate: { added: 1, removed: 0, changed: 0 } });
	});

	it('does not see key order as a change', () => {
		expect(diffTables({ take: [{ id: 't1', a: 1, b: 2 }] }, { take: [{ b: 2, id: 't1', a: 1 }] })).toEqual({});
	});
});
