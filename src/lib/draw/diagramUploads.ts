// The setup diagram's image for Flow PT (#87): before each sync, the image of each diagram that
// changed is drawn in the browser and stored as a file of its slate, `variant: 'diagram'`, with
// the key of what it shows. The outbox uploads it like a photo; it waits while the page is hidden
// or offline, as any upload does. An image that no longer matches is taken back while unsent; one
// already sent stays, and the slate's field shows the newest (lib/fpt README). The rules are
// `diagramPlan` in diagram.ts; this runs them on the store.

import type { Store } from '$lib/store/types';
import { diagramKey, diagramPlan, slateCameras, type Diagram, type SlateCamera } from './diagram';

export type RenderDiagram = (diagram: Diagram, cameras: readonly SlateCamera[]) => Promise<Blob>;

type DiagramStore = Pick<Store, 'list' | 'get' | 'blobsOf' | 'putBlob' | 'dropBlob'>;

/** Brings every diagram's image up to date. Returns how many were drawn. */
export async function prepareDiagrams(store: DiagramStore, render: RenderDiagram, onError: (error: unknown) => void = (e) => console.warn('A setup diagram image was not made:', e)): Promise<number> {
	let made = 0;
	for (const diagram of await store.list('diagram')) {
		try {
			// A slate in the trash keeps its files as they are.
			const slate = await store.get('slate', diagram.slateId);
			const day = slate && (await store.get('shootDay', slate.shootDayId));
			if (!slate || !day) continue;
			const projectId = day.projectId;
			const cameras = slateCameras({
				takes: await store.list('take', slate.id),
				setups: await store.list('cameraSetup', projectId),
				cameras: await store.list('camera', projectId),
				lenses: await store.list('lens', projectId)
			});
			const key = diagramKey(diagram, cameras);
			const plan = diagramPlan(diagram, key, await store.blobsOf(slate.id));
			for (const id of plan.drop) await store.dropBlob(id);
			if (!plan.make) continue;
			const png = await render(diagram, cameras);
			await store.putBlob('slate', slate.id, { blob: png, name: 'setup-diagram.png', variant: 'diagram', source: plan.make });
			made += 1;
		} catch (error) {
			onError(error);
		}
	}
	return made;
}
