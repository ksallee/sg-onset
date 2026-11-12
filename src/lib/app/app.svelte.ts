// The app's one store, opened once in the browser and handed out through Svelte context, with
// the editor every change goes through. `provideApp()` in the root layout, `useApp()` in any
// component under it. On the server nothing opens: `provideApp()` gives undefined there and the
// layout renders no page that would ask.
//
// The snapshotter starts with the store: it only listens until a change, and writes in an idle
// callback, so neither the first paint nor the take screen waits on it. The browser is asked to
// protect the data on each open, where that shows no dialog: nothing waits on its answer.
import { getContext, setContext } from 'svelte';
import { persistQuietly } from '$lib/pwa/persist';
import { openStore, type DexieStore } from '$lib/store/dexieStore';
import { createSnapshotter, type Snapshotter } from '$lib/store/snapshots';
import { createEditor, type EditEvent, type Editor } from './editor';
import { toSecond } from './sync/clock';
import { EMPTY_UNDO, type UndoState } from './undo';

export interface App {
	/** On-device storage. Read with the `live` helpers; write through `edit`. */
	readonly store: DexieStore;
	/** Every change the UI makes: saved, queued for sync, and undoable. */
	readonly edit: Editor;
	/** Automatic snapshots of the store (store/README.md, Snapshots). The editor calls it before risky edits. */
	readonly snapshotter: Snapshotter;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	/** The last thing the editor did, until dismissed: what a notice shows. */
	readonly lastEdit: (EditEvent & { at: number }) | null;
	dismissEdit(): void;
	/** A client UUID for a new record. */
	newId(): string;
	/** The clock, ms, to the second: FPT keeps times to the second (sync/clock.ts). */
	now(): number;
}

const KEY = Symbol('sg-onset-app');
let opened: App | undefined;

// A module reload in development lets go of the old snapshotter. A page that closes needs nothing:
// the snapshotter takes its last one as the page hides.
import.meta.hot?.dispose(() => {
	opened?.snapshotter.stop();
	opened = undefined;
});

function open(): App {
	const store = openStore();
	let undo = $state.raw<UndoState>(EMPTY_UNDO);
	let last = $state.raw<App['lastEdit']>(null);
	void persistQuietly();
	const snapshotter = createSnapshotter({ snapshots: store.snapshots, subscribe: store.subscribe });
	const edit = createEditor(
		store,
		(state, event) => {
			undo = state;
			last = { ...event, at: Date.now() };
		},
		{
			async snapshotBefore(reason) {
				const taken = (await snapshotter.snapshotBefore(reason)) !== undefined;
				if (!taken) console.warn('No snapshot before the edit:', snapshotter.lastError);
				return taken;
			}
		}
	);
	return {
		store,
		edit,
		snapshotter,
		get canUndo() {
			return undo.past.length > 0;
		},
		get canRedo() {
			return undo.future.length > 0;
		},
		get lastEdit() {
			return last;
		},
		dismissEdit() {
			last = null;
		},
		newId: () => crypto.randomUUID(),
		now: () => toSecond(Date.now())
	};
}

/** The app, opened on first call. Undefined where there is no IndexedDB: on the server. */
export function openApp(): App | undefined {
	if (typeof indexedDB === 'undefined') return undefined;
	opened ??= open();
	// A handle for the console and for screenshots, in development only.
	if (import.meta.env.DEV) (globalThis as { sgOnset?: App }).sgOnset = opened;
	return opened;
}

/** Opens the app and puts it in context. Call once, in the root layout. */
export function provideApp(): App | undefined {
	const app = openApp();
	setContext(KEY, app);
	return app;
}

/** The app, or undefined on the server. For helpers that must not throw there. */
export function maybeApp(): App | undefined {
	return getContext<App | undefined>(KEY);
}

/** The app. Call while a component initialises, in the browser. */
export function useApp(): App {
	const app = maybeApp();
	if (!app) throw new Error('useApp: no app in context. It opens in the browser only, under the root layout.');
	return app;
}
