// Keeps each photo's annotated copy in step with its drawing (#86). After a change to a drawing
// (an edit, an undo, a redo, from anywhere), it makes the copy that matches, through `flatten`,
// and takes back the copies that no longer match while their upload has not left. The rules are
// `flattenPlan` in markup.ts; this runs them on the store. Started once, with the store.
//
// A photo whose drawing is open is held: nothing is flattened under the pen. The copy is made once
// the drawing closes, so a session of strokes makes one copy, not one per stroke.

import type { Store } from '$lib/store/types';
import { isBlank } from './drawing';
import { flattenPlan, markupKey, originalFile, type Markup } from './markup';

export type FlattenFn = (photo: Blob, markup: Markup) => Promise<Blob>;

export interface Flattener {
	/** One pass now, after any pass under way. */
	run(): Promise<void>;
	/** A pass soon. */
	kick(): void;
	/** Leaves a photo alone while its drawing is open. Returns the release. */
	hold(stillId: string): () => void;
	/** Resolves once no pass is due or under way. */
	idle(): Promise<void>;
	stop(): void;
}

type FlatStore = Pick<Store, 'list' | 'get' | 'blobsOf' | 'blob' | 'putBlob' | 'dropBlob' | 'subscribe'>;

export function createFlattener(options: { store: FlatStore; flatten: FlattenFn; delayMs?: number; onError?: (error: unknown) => void }): Flattener {
	const { store, flatten } = options;
	const delayMs = options.delayMs ?? 1500;
	const onError = options.onError ?? ((error: unknown) => console.warn('The annotated copy of a photo was not made:', error));
	/** The key of each drawing as last handled, by still. A blank drawing is ''. */
	const seen = new Map<string, string>();
	const held = new Set<string>();
	let chain: Promise<void> = Promise.resolve();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	async function reconcile(stillId: string, markup: Markup | undefined): Promise<void> {
		// A photo in the trash keeps its files as they are.
		if (!(await store.get('still', stillId))) return;
		const files = await store.blobsOf(stillId);
		const plan = flattenPlan(markup, files);
		for (const id of plan.drop) await store.dropBlob(id);
		if (!plan.make || !markup) return;
		const original = originalFile(files);
		const bytes = original && (await store.blob(original.id));
		if (!bytes) return;
		const flat = await flatten(bytes, markup);
		// Drawn on while it was painted: the next pass drops this copy and makes the right one.
		await store.putBlob('still', stillId, { blob: flat, name: 'annotated.jpg', variant: 'annotated', source: plan.make });
	}

	async function pass(): Promise<void> {
		const markups = await store.list('markup');
		const byStill = new Map(markups.map((m) => [m.stillId, m]));
		const keyOf = (m: Markup | undefined) => (m && !isBlank(m) ? markupKey(m) : '');
		const changed = [...byStill.keys()].filter((id) => seen.get(id) !== keyOf(byStill.get(id)));
		const gone = [...seen.keys()].filter((id) => !byStill.has(id));
		for (const stillId of [...changed, ...gone]) {
			if (held.has(stillId)) continue;
			const markup = byStill.get(stillId);
			try {
				await reconcile(stillId, markup);
			} catch (error) {
				onError(error);
			}
			if (markup) seen.set(stillId, keyOf(markup));
			else seen.delete(stillId);
		}
	}

	const flattener: Flattener = {
		run() {
			chain = chain.then(pass).catch(onError);
			return chain;
		},
		kick() {
			if (stopped) return;
			clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				void flattener.run();
			}, delayMs);
		},
		hold(stillId) {
			held.add(stillId);
			return () => {
				held.delete(stillId);
				flattener.kick();
			};
		},
		async idle() {
			while (timer !== undefined) await new Promise((r) => setTimeout(r, delayMs + 1));
			await chain;
		},
		stop() {
			stopped = true;
			clearTimeout(timer);
			timer = undefined;
			unsubscribe();
		}
	};

	const unsubscribe = store.subscribe((event) => {
		if (event.tables.includes('markup') || event.tables.includes('still')) flattener.kick();
	});
	flattener.kick();
	return flattener;
}
