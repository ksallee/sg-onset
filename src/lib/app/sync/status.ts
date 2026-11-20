// What the sync status says: from the account, the project link, the site setup, the network
// and the queue. Pure.

import type { AuthStatus } from '$lib/auth/state';
import type { Unsynced } from '$lib/outbox/select';

/**
 * - `attention`: something waits for a person. It wins over the rest.
 * - `signedOut`, `expired`, `unlinked`, `setup`, `offline`: what stops sync, in that order.
 * - `syncing`: changes wait and sync can run. `synced`: nothing waits.
 * - `waiting`: all that sync can move is synced, and some changes wait on the device for an entity
 *   the site lacks: "All synced, 3 waiting", so nobody takes them for safe in Flow PT (Kevin, #117).
 */
export type SyncState = 'attention' | 'signedOut' | 'expired' | 'unlinked' | 'setup' | 'offline' | 'syncing' | 'synced' | 'waiting';

export interface SyncInputs {
	auth: AuthStatus;
	/** The current project is linked to an FPT project on the signed-in site. */
	linked: boolean;
	/** The site passed the setup check. */
	ready: boolean;
	online: boolean;
	/** What sync can move, of the current project. */
	unsynced: Pick<Unsynced, 'entries' | 'attention'> | undefined;
	/**
	 * Entries that wait on the device for an entity the site lacks (waiting.ts): the set references,
	 * on a site without Set Reference. A Set Shot's links are no entry: they wait in the slates' codes.
	 */
	waiting?: number;
}

export interface SyncStatus {
	state: SyncState;
	/** Entries that need a person, for `attention`; entries syncing, for `syncing`; entries waiting, for the rest. */
	count: number;
	/** The status in words and in one word, as message keys. `{n}` is `count`. */
	key: `sync.state.${SyncState}`;
	shortKey: `sync.state.short.${SyncState}`;
	/** Its accessible name: with the count said apart where the words leave it out. `{status}` is the words. */
	openKey: 'sync.open' | 'sync.state.open';
}

function stateOf(i: SyncInputs, attention: number, entries: number, waiting: number): SyncState {
	if (attention > 0) return 'attention';
	if (i.auth === 'signed-out') return 'signedOut';
	if (i.auth === 'expired') return 'expired';
	if (!i.linked) return 'unlinked';
	if (!i.ready) return 'setup';
	if (!i.online) return 'offline';
	if (entries > 0) return 'syncing';
	return waiting > 0 ? 'waiting' : 'synced';
}

/** The states whose words hold the count: the others say it apart. */
const SAID: readonly SyncState[] = ['attention', 'syncing', 'waiting'];

export function syncStatus(i: SyncInputs): SyncStatus {
	const entries = i.unsynced?.entries ?? 0;
	const attention = i.unsynced?.attention ?? 0;
	const waiting = i.waiting ?? 0;
	const state = stateOf(i, attention, entries, waiting);
	// While sync is stopped, what waits for an entity is on the device like the rest.
	const count = state === 'attention' ? attention : state === 'syncing' ? entries : entries + waiting;
	return {
		state,
		count,
		key: `sync.state.${state}`,
		shortKey: `sync.state.short.${state}`,
		openKey: count > 0 && !SAID.includes(state) ? 'sync.state.open' : 'sync.open'
	};
}
