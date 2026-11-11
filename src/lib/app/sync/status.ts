// What the sync status says: from the account, the project link, the site setup, the network
// and the queue. Pure.

import type { AuthStatus } from '$lib/auth/state';
import type { Unsynced } from '$lib/outbox/select';

/**
 * - `attention`: something waits for a person. It wins over the rest.
 * - `signedOut`, `expired`, `unlinked`, `setup`, `offline`: what stops sync, in that order.
 * - `syncing`: changes wait and sync can run. `synced`: nothing waits.
 */
export type SyncState = 'attention' | 'signedOut' | 'expired' | 'unlinked' | 'setup' | 'offline' | 'syncing' | 'synced';

export interface SyncInputs {
	auth: AuthStatus;
	/** The current project is linked to an FPT project on the signed-in site. */
	linked: boolean;
	/** The site passed the setup check. */
	ready: boolean;
	online: boolean;
	unsynced: Pick<Unsynced, 'entries' | 'attention'> | undefined;
}

export interface SyncStatus {
	state: SyncState;
	/** Entries that need a person, for `attention`; entries waiting, for the rest. */
	count: number;
	/** The status in words and in one word, as message keys. `{n}` is `count`. */
	key: `sync.state.${SyncState}`;
	shortKey: `sync.state.short.${SyncState}`;
}

function stateOf(i: SyncInputs, attention: number, entries: number): SyncState {
	if (attention > 0) return 'attention';
	if (i.auth === 'signed-out') return 'signedOut';
	if (i.auth === 'expired') return 'expired';
	if (!i.linked) return 'unlinked';
	if (!i.ready) return 'setup';
	if (!i.online) return 'offline';
	return entries > 0 ? 'syncing' : 'synced';
}

export function syncStatus(i: SyncInputs): SyncStatus {
	const entries = i.unsynced?.entries ?? 0;
	const attention = i.unsynced?.attention ?? 0;
	const state = stateOf(i, attention, entries);
	return { state, count: state === 'attention' ? attention : entries, key: `sync.state.${state}`, shortKey: `sync.state.short.${state}` };
}
