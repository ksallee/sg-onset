// The app's one store, opened once in the browser and handed out through Svelte context, with
// the editor every change goes through. `provideApp()` in the root layout, `useApp()` in any
// component under it. On the server nothing opens: `provideApp()` gives undefined there and the
// layout renders no page that would ask.
import { getContext, setContext } from 'svelte';
import { openStore, type DexieStore } from '$lib/store/dexieStore';
import { createEditor, type EditEvent, type Editor } from './editor';
import { toSecond } from './sync/clock';
import { EMPTY_UNDO, type UndoState } from './undo';

export interface App {
	/** On-device storage. Read with the `live` helpers; write through `edit`. */
	readonly store: DexieStore;
	/** Every change the UI makes: saved, queued for sync, and undoable. */
	readonly edit: Editor;
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

function open(): App {
	const store = openStore();
	let undo = $state.raw<UndoState>(EMPTY_UNDO);
	let last = $state.raw<App['lastEdit']>(null);
	const edit = createEditor(store, (state, event) => {
		undo = state;
		last = { ...event, at: Date.now() };
	});
	return {
		store,
		edit,
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
