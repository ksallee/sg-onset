import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createEditor } from '$lib/app/editor';
import { openStore } from '$lib/store/dexieStore';
import { applyClipImport, doneLabel } from './apply';
import type { Clip } from './clips';
import { lastFilled, planFill } from './plan';

let n = 0;
function setup() {
	const store = openStore({ name: `clips-${++n}`, indexedDB: new IDBFactory(), IDBKeyRange, now: () => 1000, uuid: () => `u${++n}` });
	return { store, edit: createEditor(store) };
}
const clip = (row: number, name: string, roll: string): Clip => ({ row, name, roll, start: '14:00:00:00', end: '14:00:40:00', rate: { num: 24, denom: 1 }, dropFrame: false });

describe('applyClipImport', () => {
	it('fills the takes and keeps what it wrote, as one undo entry', async () => {
		const s = setup();
		await s.store.create('project', { id: 'p1', name: 'Show' });
		await s.store.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-17' });
		await s.store.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '42A' });
		await s.store.create('take', { id: 't1', slateId: 's1', take: '1' });
		await s.store.create('take', { id: 't2', slateId: 's1', take: '2', cameraRoll: 'A009' });

		const takes = await s.store.list('take', 's1');
		const plan = planFill(
			[
				{ clip: clip(10, 'A001C001', 'A001'), take: takes.find((t) => t.id === 't1')! },
				{ clip: clip(11, 'A001C002', 'A001'), take: takes.find((t) => t.id === 't2')! }
			],
			lastFilled(await s.store.list('clipImport', 'd1'))
		);
		await applyClipImport(s, plan, { id: 'i1', shootDayId: 'd1', importedAt: '2026-11-17T19:00:00Z', fileName: 'A001.ale' });

		expect(await s.store.get('take', 't1')).toMatchObject({ clipName: 'A001C001', cameraRoll: 'A001', timecodeStart: '14:00:00:00' });
		expect((await s.store.get('take', 't2'))?.cameraRoll).toBe('A009');
		expect(await s.store.list('clipImport', 'd1')).toEqual([
			{
				id: 'i1',
				shootDayId: 'd1',
				importedAt: '2026-11-17T19:00:00Z',
				fileName: 'A001.ale',
				filled: { t1: { clipName: 'A001C001', cameraRoll: 'A001', timecodeStart: '14:00:00:00', timecodeEnd: '14:00:40:00' }, t2: { clipName: 'A001C002', timecodeStart: '14:00:00:00', timecodeEnd: '14:00:40:00' } }
			}
		]);
		expect(s.edit.state.past).toHaveLength(1);
		expect(s.edit.state.past[0].label).toEqual({ key: 'clips.done.other', params: { n: 2 } });
		// Kept on the device: nothing queued for the import entry.
		expect((await s.store.outbox.entries()).filter((e) => e.op.table === 'clipImport')).toEqual([]);

		await s.edit.undo();
		expect((await s.store.get('take', 't1'))?.clipName).toBeUndefined();
		expect(await s.store.list('clipImport', 'd1')).toEqual([]);
	});
});

describe('doneLabel', () => {
	it('counts the takes filled', () => {
		expect(doneLabel(1)).toEqual({ key: 'clips.done.one', params: { n: 1 } });
		expect(doneLabel(3)).toEqual({ key: 'clips.done.other', params: { n: 3 } });
	});
});
