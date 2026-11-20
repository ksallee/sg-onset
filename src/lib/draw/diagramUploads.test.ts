// The images of the setup diagrams, made for Flow PT, against a real store (IndexedDB in memory)
// and a fake renderer.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { markInFlight } from '$lib/outbox/machine';
import { openStore } from '$lib/store/dexieStore';
import { DIAGRAM_SIZE, diagramKey, slateCameras, type Diagram } from './diagram';
import { prepareDiagrams } from './diagramUploads';
import type { Figure } from './drawing';

let n = 0;
const light = (x: number): Figure => ({ kind: 'symbol', id: 'l1', symbol: 'light', ink: 'black', at: { x, y: 300 }, rotation: 0, size: 48 });

async function setup() {
	const store = openStore({ name: `dg${++n}`, indexedDB: new IDBFactory(), IDBKeyRange, uuid: () => `u${++n}` });
	await store.create('project', { id: 'p1', name: 'Show' });
	await store.create('shootDay', { id: 'd1', projectId: 'p1' });
	await store.create('camera', { id: 'c1', projectId: 'p1', cameraModel: 'ALEXA 35', activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 } });
	await store.create('lens', { id: 'l32', projectId: 'p1', lensModel: 'S4/i 32 mm', focalLength: 32 });
	await store.create('lens', { id: 'l50', projectId: 'p1', lensModel: 'S4/i 50 mm', focalLength: 50 });
	await store.create('cameraSetup', { id: 'sA', projectId: 'p1', cameraLabel: 'A', cameraId: 'c1', lensId: 'l32' });
	await store.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '42A' });
	await store.create('take', { id: 't1', slateId: 's1', take: '1', cameraSetupId: 'sA', cameraId: 'c1', lensId: 'l32' });
	const drawn: string[] = [];
	const render = async (diagram: Diagram) => {
		drawn.push(diagram.id);
		return new Blob(['png'], { type: 'image/png' });
	};
	const diagram: Diagram = { id: 'dg1', slateId: 's1', ...DIAGRAM_SIZE, shapes: [light(100)] };
	const images = async () => (await store.blobsOf('s1')).filter((b) => b.variant === 'diagram');
	return { store, render, drawn, diagram, images };
}

describe('prepareDiagrams', () => {
	it('draws the image of a diagram as a file of its slate, with its key, and queues its upload', async () => {
		const s = await setup();
		await s.store.create('diagram', s.diagram);
		expect(await prepareDiagrams(s.store, s.render)).toBe(1);
		const [image] = await s.images();
		const cams = slateCameras({ takes: await s.store.list('take', 's1'), setups: await s.store.list('cameraSetup', 'p1'), cameras: await s.store.list('camera', 'p1'), lenses: await s.store.list('lens', 'p1') });
		expect(image).toMatchObject({ table: 'slate', recordId: 's1', variant: 'diagram', source: diagramKey(s.diagram, cams), type: 'image/png' });
		expect((await s.store.outbox.entries()).some((e) => e.op.kind === 'blob' && e.op.blobId === image.id && e.op.variant === 'diagram' && e.op.table === 'slate')).toBe(true);
		// Nothing changed: nothing drawn again.
		expect(await prepareDiagrams(s.store, s.render)).toBe(0);
		expect(s.drawn).toEqual(['dg1']);
	});

	it('draws it again when the diagram or a camera’s lens changes, and drops the unsent image', async () => {
		const s = await setup();
		await s.store.create('diagram', s.diagram);
		await prepareDiagrams(s.store, s.render);
		await s.store.apply('diagram', [{ id: 'dg1', key: 'shapes', from: s.diagram.shapes, to: [light(200)] }]);
		await prepareDiagrams(s.store, s.render);
		expect(await s.images()).toHaveLength(1);
		await s.store.apply('take', [{ id: 't1', key: 'lensId', from: 'l32', to: 'l50' }]);
		expect(await prepareDiagrams(s.store, s.render)).toBe(1);
		expect(await s.images()).toHaveLength(1);
		expect(s.drawn).toEqual(['dg1', 'dg1', 'dg1']);
	});

	it('keeps an image whose upload has left beside the new one', async () => {
		const s = await setup();
		await s.store.create('diagram', s.diagram);
		await prepareDiagrams(s.store, s.render);
		const [first] = await s.images();
		await s.store.outbox.update((q) => markInFlight(q, q.filter((e) => e.op.kind === 'blob' && e.op.blobId === first.id).map((e) => e.id)));
		await s.store.apply('diagram', [{ id: 'dg1', key: 'shapes', from: s.diagram.shapes, to: [light(200)] }]);
		await prepareDiagrams(s.store, s.render);
		expect(await s.images()).toHaveLength(2);
	});

	it('draws nothing for a blank diagram, and takes back its unsent image', async () => {
		const s = await setup();
		await s.store.create('diagram', s.diagram);
		await prepareDiagrams(s.store, s.render);
		await s.store.apply('diagram', [{ id: 'dg1', key: 'shapes', from: s.diagram.shapes, to: [] }]);
		expect(await prepareDiagrams(s.store, s.render)).toBe(0);
		expect(await s.images()).toEqual([]);
	});

	it('says what went wrong and carries on', async () => {
		const s = await setup();
		await s.store.create('diagram', s.diagram);
		const errors: unknown[] = [];
		expect(await prepareDiagrams(s.store, async () => Promise.reject(new Error('no canvas')), (e) => errors.push(e))).toBe(0);
		expect(errors).toHaveLength(1);
	});
});
