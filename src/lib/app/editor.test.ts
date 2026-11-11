import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { change } from '$lib/model/patch';
import { openStore } from '$lib/store/dexieStore';
import { createEditor, type EditEvent } from './editor';

let n = 0;
function setup() {
	const store = openStore({ name: `editor-${++n}`, indexedDB: new IDBFactory(), IDBKeyRange, now: () => 1000, uuid: () => `u${++n}` });
	const events: EditEvent[] = [];
	const edit = createEditor(store, (_, event) => events.push(event));
	return { store, edit, events };
}
async function shoot(s: ReturnType<typeof setup>) {
	await s.store.create('project', { id: 'p1', name: 'Show' });
	await s.store.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
	await s.store.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '12A' });
	await s.store.create('take', { id: 't1', slateId: 's1', take: '1', tStop: 2.8 });
	await s.store.create('take', { id: 't2', slateId: 's1', take: '2', tStop: 2.8 });
}

describe('apply', () => {
	it('saves the edit, queues it, and undo puts the old value back', async () => {
		const s = setup();
		await shoot(s);
		const take = (await s.store.get('take', 't1'))!;
		await s.edit.set('take', take, 'tStop', 4, { key: 'edit.changed' });
		expect((await s.store.get('take', 't1'))?.tStop).toBe(4);
		expect(s.edit.state.past).toHaveLength(1);
		expect(s.events).toEqual([{ kind: 'done', label: { key: 'edit.changed' } }]);

		expect(await s.edit.undo()).toEqual({ kind: 'undone', label: { key: 'edit.changed' } });
		expect((await s.store.get('take', 't1'))?.tStop).toBe(2.8);
		expect(s.edit.state).toMatchObject({ past: [], future: [{}] });

		expect((await s.edit.redo())?.kind).toBe('redone');
		expect((await s.store.get('take', 't1'))?.tStop).toBe(4);
	});
	it('uses the stored value as the old one, whatever the patch said', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.apply('take', [{ id: 't1', key: 'tStop', from: 99, to: 5.6 }]);
		await s.edit.undo();
		expect((await s.store.get('take', 't1'))?.tStop).toBe(2.8);
	});
	it('keeps no entry for an edit that changed nothing', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.set('take', { id: 't1' }, 'tStop', 2.8);
		expect(s.edit.state.past).toEqual([]);
		expect(await s.edit.undo()).toBeUndefined();
	});
	it('clears a field with undefined, and undo brings it back', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.set('take', { id: 't1' }, 'tStop', undefined);
		expect((await s.store.get('take', 't1'))?.tStop).toBeUndefined();
		await s.edit.undo();
		expect((await s.store.get('take', 't1'))?.tStop).toBe(2.8);
	});
});

describe('create and remove', () => {
	it('undo of a create removes the record, redo brings it back', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.create('slate', { id: 's2', shootDayId: 'd1', slateUID: '12B' }, { label: { key: 'edit.created' } });
		await s.edit.undo();
		expect(await s.store.get('slate', 's2')).toBeUndefined();
		// Never sent, so nothing of it is left to sync.
		expect((await s.store.outbox.entries()).some((e) => e.op.recordId === 's2')).toBe(false);
		await s.edit.redo();
		expect((await s.store.get('slate', 's2'))?.slateUID).toBe('12B');
	});
	it('undo of a remove restores the record', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.remove('take', 't2');
		expect(await s.store.get('take', 't2')).toBeUndefined();
		await s.edit.undo();
		expect((await s.store.get('take', 't2'))?.take).toBe('2');
	});
	it('removes a record with everything under it as one entry', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.removeTree('shootDay', 'd1', { key: 'edit.removed' });
		expect(await s.store.list('slate')).toEqual([]);
		expect(await s.store.list('take')).toEqual([]);
		expect(await s.store.get('project', 'p1')).toBeDefined();
		expect(s.edit.state.past).toHaveLength(1);
		await s.edit.undo();
		expect((await s.store.list('take', 's1')).map((t) => t.id).sort()).toEqual(['t1', 't2']);
		expect(await s.store.get('shootDay', 'd1')).toBeDefined();
	});
});

describe('group', () => {
	it('makes one entry of several edits, across tables', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.group({ key: 'bulk' }, async () => {
			await s.edit.apply('take', [change({ id: 't1' }, 'tStop', 8), change({ id: 't2' }, 'tStop', 8)]);
			await s.edit.set('slate', { id: 's1' }, 'sceneNumber', '12');
		});
		expect(s.edit.state.past).toHaveLength(1);
		expect(s.events).toEqual([{ kind: 'done', label: { key: 'bulk' } }]);
		await s.edit.undo();
		expect((await s.store.list('take', 's1')).map((t) => t.tStop)).toEqual([2.8, 2.8]);
		expect((await s.store.get('slate', 's1'))?.sceneNumber).toBeUndefined();
	});
	it('keeps what a failed group did, so it can be undone', async () => {
		const s = setup();
		await shoot(s);
		await expect(
			s.edit.group(undefined, async () => {
				await s.edit.set('take', { id: 't1' }, 'tStop', 8);
				throw new Error('half way');
			})
		).rejects.toThrow('half way');
		await s.edit.undo();
		expect((await s.store.get('take', 't1'))?.tStop).toBe(2.8);
	});
});

describe('undo after the server took a delete', () => {
	it('says it is too late and drops the entry', async () => {
		const s = setup();
		let restored = true;
		const edit = createEditor({ ...s.store, restore: async () => restored, list: s.store.list, apply: s.store.apply, create: s.store.create, remove: s.store.remove });
		await shoot(s);
		await edit.remove('take', 't2', { key: 'edit.removed' });
		restored = false;
		expect(await edit.undo()).toEqual({ kind: 'tooLate', label: { key: 'edit.removed' } });
		expect(edit.state).toEqual({ past: [], future: [] });
	});
});

describe('a snapshot before a risky edit', () => {
	function guarded(result: 'take' | 'fail' | 'throw' = 'take') {
		const s = setup();
		const reasons: string[] = [];
		const edit = createEditor(s.store, (_, event) => s.events.push(event), {
			async snapshotBefore(reason) {
				reasons.push(reason);
				if (result === 'throw') throw new Error('disk full');
				if (result === 'fail') return false;
				return (await s.store.snapshots.take(reason)) !== undefined;
			}
		});
		return { ...s, edit, reasons };
	}
	async function takes(s: ReturnType<typeof setup>, n: number) {
		await s.store.create('project', { id: 'p1', name: 'Show' });
		await s.store.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
		await s.store.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '12A' });
		for (let i = 0; i < n; i++) await s.store.create('take', { id: `t${i}`, slateId: 's1', take: String(i + 1), tStop: 2.8 });
	}
	const bulk = (n: number) => Array.from({ length: n }, (_, i) => change({ id: `t${i}` }, 'tStop', 4));

	it('takes one before a patch of 20 entries, holding the values from before it', async () => {
		const s = guarded();
		await takes(s, 20);
		await s.edit.apply('take', bulk(20), { key: 'edit.changed' });
		expect(s.reasons).toEqual(['bulkEdit']);
		expect((await s.store.get('take', 't0'))?.tStop).toBe(4);
		const [snap] = await s.store.snapshots.list();
		expect(snap).toMatchObject({ reason: 'bulkEdit', kind: 'risky', verified: true });
		// Restoring it would change back every entry the patch changed: it holds the old values.
		expect((await s.store.snapshots.preview(snap.id)).tables.take).toEqual({ added: 0, removed: 0, changed: 20 });
		expect(s.events.at(-1)).toEqual({ kind: 'done', label: { key: 'edit.changed' } });
	});

	it('takes none below 20 entries', async () => {
		const s = guarded();
		await takes(s, 19);
		await s.edit.apply('take', bulk(19));
		expect(s.reasons).toEqual([]);
		expect(await s.store.snapshots.list()).toEqual([]);
	});

	it('counts entries, not changes: two fields of ten takes is ten', async () => {
		const s = guarded();
		await takes(s, 10);
		await s.edit.apply('take', [...bulk(10), ...Array.from({ length: 10 }, (_, i) => change({ id: `t${i}` }, 'notes', 'x'))]);
		expect(s.reasons).toEqual([]);
	});

	it('takes one before deleting a shoot day, and it holds the day and its takes', async () => {
		const s = guarded();
		await takes(s, 2);
		await s.edit.removeTree('shootDay', 'd1', { key: 'edit.removed' });
		expect(s.reasons).toEqual(['deleteShootDay']);
		expect(await s.store.list('shootDay', 'p1')).toEqual([]);
		const [snap] = await s.store.snapshots.list();
		expect(snap.counts).toMatchObject({ shootDay: 1, slate: 1, take: 2 });
	});

	it('takes one before deleting a project, none before deleting a slate', async () => {
		const s = guarded();
		await takes(s, 2);
		await s.edit.removeTree('slate', 's1');
		expect(s.reasons).toEqual([]);
		await s.edit.removeTree('project', 'p1');
		expect(s.reasons).toEqual(['deleteProject']);
	});

	it('goes on with the edit when the snapshot fails, and says so once', async () => {
		for (const result of ['fail', 'throw'] as const) {
			const s = guarded(result);
			await takes(s, 20);
			await s.edit.apply('take', bulk(20), { key: 'edit.changed' });
			expect((await s.store.get('take', 't19'))?.tStop).toBe(4);
			expect(s.events.filter((e) => e.noSnapshot)).toEqual([{ kind: 'done', label: { key: 'edit.changed' }, noSnapshot: true }]);
			// Undo still works.
			await s.edit.undo();
			expect((await s.store.get('take', 't19'))?.tStop).toBe(2.8);
		}
	});

	it('says so for a failed delete snapshot too, and the delete happens', async () => {
		const s = guarded('fail');
		await takes(s, 1);
		await s.edit.removeTree('shootDay', 'd1', { key: 'edit.removed' });
		expect(await s.store.get('shootDay', 'd1')).toBeUndefined();
		expect(s.events.at(-1)).toEqual({ kind: 'done', label: { key: 'edit.removed' }, noSnapshot: true });
	});
});
