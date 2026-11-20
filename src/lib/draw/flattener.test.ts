// The flattener against a real store (IndexedDB in memory) and a fake flatten: it keeps each
// photo's annotated copy in step with its drawing.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { markInFlight } from '$lib/outbox/machine';
import { openStore } from '$lib/store/dexieStore';
import type { TextNote } from './drawing';
import { createFlattener } from './flattener';
import { markupKey, type Markup } from './markup';

let n = 0;
const note = (text: string): TextNote => ({ kind: 'text', id: 't1', ink: 'red', at: { x: 10, y: 10 }, size: 20, text });

async function setup() {
	const store = openStore({ name: `flat${++n}`, indexedDB: new IDBFactory(), IDBKeyRange, uuid: () => `u${++n}` });
	await store.create('project', { id: 'p1', name: 'Show' });
	await store.create('shootDay', { id: 'd1', projectId: 'p1' });
	await store.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '12A' });
	await store.create('take', { id: 't1', slateId: 's1', take: '1' });
	await store.create('still', { id: 'ph1', takeId: 't1', capturedAt: '2026-11-11T09:00:00.000Z' }, { blob: new Blob(['photo'], { type: 'image/jpeg' }) });
	const made: string[] = [];
	const flattener = createFlattener({
		store,
		delayMs: 0,
		flatten: async (photo, markup) => {
			made.push(markup.shapes.map((s) => (s.kind === 'text' ? s.text : s.kind)).join());
			return new Blob([await photo.text(), '+', JSON.stringify(markup.shapes)], { type: 'image/jpeg' });
		}
	});
	const markup: Markup = { id: 'm1', stillId: 'ph1', width: 400, height: 300, shapes: [note('Hi')] };
	const copies = async () => (await store.blobsOf('ph1')).filter((b) => b.variant === 'annotated');
	return { store, flattener, made, markup, copies };
}

describe('createFlattener', () => {
	it('makes the annotated copy of a drawing, marked with its key, and queues its upload', async () => {
		const s = await setup();
		await s.store.create('markup', s.markup);
		await s.flattener.run();
		const [copy] = await s.copies();
		expect(copy).toMatchObject({ variant: 'annotated', source: markupKey(s.markup), type: 'image/jpeg' });
		expect(await (await s.store.blob(copy.id))!.text()).toContain('photo+');
		expect((await s.store.outbox.entries()).some((e) => e.op.kind === 'blob' && e.op.blobId === copy.id && e.op.variant === 'annotated')).toBe(true);
		await s.flattener.run();
		expect(s.made).toEqual(['Hi']);
	});

	it('replaces an unsent copy when the drawing changes, and drops it when the drawing goes', async () => {
		const s = await setup();
		await s.store.create('markup', s.markup);
		await s.flattener.run();
		await s.store.apply('markup', [{ id: 'm1', key: 'shapes', from: s.markup.shapes, to: [note('Ho')] }]);
		await s.flattener.run();
		const copies = await s.copies();
		expect(copies.map((c) => c.source)).toEqual([markupKey({ ...s.markup, shapes: [note('Ho')] })]);
		await s.store.remove('markup', 'm1');
		await s.flattener.run();
		expect(await s.copies()).toEqual([]);
	});

	it('keeps a copy whose upload has left, beside the new one', async () => {
		const s = await setup();
		await s.store.create('markup', s.markup);
		await s.flattener.run();
		const [first] = await s.copies();
		await s.store.outbox.update((q) => markInFlight(q, q.filter((e) => e.op.kind === 'blob' && e.op.blobId === first.id).map((e) => e.id)));
		await s.store.apply('markup', [{ id: 'm1', key: 'shapes', from: s.markup.shapes, to: [note('Ho')] }]);
		await s.flattener.run();
		expect((await s.copies()).length).toBe(2);
	});

	it('leaves alone a photo whose drawing is open, until it is let go', async () => {
		const s = await setup();
		const release = s.flattener.hold('ph1');
		await s.store.create('markup', s.markup);
		await s.flattener.run();
		expect(await s.copies()).toEqual([]);
		release();
		await s.flattener.run();
		expect((await s.copies()).length).toBe(1);
	});

	it('runs by itself after a change to a drawing', async () => {
		const s = await setup();
		await s.store.create('markup', s.markup);
		await s.flattener.idle();
		expect((await s.copies()).length).toBe(1);
		s.flattener.stop();
	});

	it('says what went wrong and carries on with the next photo', async () => {
		const s = await setup();
		s.flattener.stop();
		const errors: unknown[] = [];
		const failing = createFlattener({ store: s.store, delayMs: 0, flatten: async () => Promise.reject(new Error('no decoder')), onError: (e) => errors.push(e) });
		await s.store.create('markup', s.markup);
		await failing.run();
		expect(errors).toHaveLength(1);
		expect(await s.copies()).toEqual([]);
	});
});
