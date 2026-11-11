// Sync for the UI: the engine (engine.ts) on the real page, store and session, its state as a
// rune, and the status the shell shows. `provideSync()` in the shell, `useSync()` in the sync
// sheet. The shell renders in the browser only, so nothing here runs on the server.
import { getContext, setContext } from 'svelte';
import { auth, bearer } from '$lib/auth/session.svelte';
import { storageKeyValue } from '$lib/fpt';
import { browserPage } from '$lib/outbox/foreground';
import type { Unsynced } from '$lib/outbox/select';
import { useApp } from '../app.svelte';
import { createSyncEngine, type SyncEngine, type SyncState } from './engine';
import { syncStatus, type SyncStatus } from './status';

export interface SyncController extends Omit<SyncEngine, 'state' | 'subscribe' | 'setProject' | 'refresh' | 'dispose'> {
	readonly state: SyncState;
	readonly status: SyncStatus;
	/** Changes waiting for other projects on this device. */
	readonly elsewhere: number;
}

const KEY = Symbol('sg-onset-sync');

/** Call once, in the shell, while it initialises. */
export function provideSync(projectId: () => string | undefined, everything: () => Unsynced | undefined): SyncController {
	const app = useApp();
	const engine = createSyncEngine({
		store: app.store,
		// A signed-out device keeps the site it used; sync has none.
		site: () => (auth.status === 'signed-out' ? null : auth.site),
		canSync: () => auth.canSync,
		bearer,
		schemaCache: storageKeyValue(localStorage),
		kv: storageKeyValue(localStorage, 'sg-onset:sync:'),
		page: browserPage()
	});
	let state = $state.raw<SyncState>(engine.state);
	engine.subscribe((next) => (state = next));

	$effect(() => {
		void engine.setProject(projectId());
	});
	$effect(() => {
		// The account changed: signed in, out, expired, or another site.
		void [auth.status, auth.site];
		void engine.refresh();
	});
	$effect(() => () => engine.dispose());

	const counts = $derived(state.scoped ?? everything());
	const status = $derived(syncStatus({ auth: auth.status, linked: !!state.link, ready: state.ready, online: state.online, unsynced: counts }));
	const elsewhere = $derived(Math.max(0, (everything()?.entries ?? 0) - (state.scoped?.entries ?? everything()?.entries ?? 0)));

	const controller: SyncController = {
		get state() {
			return state;
		},
		get status() {
			return status;
		},
		get elsewhere() {
			return elsewhere;
		},
		listProjects: () => engine.listProjects(),
		link: (choice) => engine.link(choice),
		unlink: () => engine.unlink(),
		check: (createFields) => engine.check(createFields),
		syncNow: () => engine.syncNow()
	};
	setContext(KEY, controller);
	return controller;
}

export function useSync(): SyncController {
	const sync = getContext<SyncController | undefined>(KEY);
	if (!sync) throw new Error('useSync: no sync in context. The shell provides it.');
	return sync;
}
