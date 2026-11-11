/**
 * The app's sign-in state, kept on this device. Read `auth` anywhere; only sync
 * should call `bearer()`.
 *
 * Storage follows sg-notes and sg-task-templates: the session token sits in
 * `localStorage` and never reaches this app's server after sign-in. The browser
 * mints the 600 s bearer itself at `/api/v1/auth/access_token`, which answers
 * CORS for any origin (corpus findings/062_cors.md), through sg-widgets-core's
 * `createSessionTokenAuth`. Every mint renews the session on the site
 * (findings/052_app_session_launcher.md). A refusal with 400 code 102
 * (findings/126_session_idle.md) marks the state expired; any other failure,
 * offline included, changes nothing.
 */
import { createSessionTokenAuth } from 'sg-widgets-core';
import { canSync, EMPTY, expire, isSessionRefused, parseStored, serializeStored, signedIn, signedOut, viewOf, type StoredAuth } from './state';
import type { ApprovedSignIn } from './sign-in';

const KEY = 'sg-onset:auth';

function load(): StoredAuth {
	try {
		return parseStored(localStorage.getItem(KEY));
	} catch {
		return EMPTY;
	}
}

let stored = $state<StoredAuth>(typeof localStorage === 'undefined' ? EMPTY : load());
const view = $derived(viewOf(stored));
let minter: { token: string; mint: () => Promise<string> } | null = null;

function save(next: StoredAuth): void {
	stored = next;
	minter = null;
	try {
		localStorage.setItem(KEY, serializeStored(next));
	} catch {
		// Blocked storage: the state holds for this page load only.
	}
}

// Another tab signed in or out.
if (typeof window !== 'undefined') {
	window.addEventListener('storage', (event) => {
		if (event.key === KEY) {
			stored = parseStored(event.newValue);
			minter = null;
		}
	});
}

/** Signed out, signed in or expired; the site and the person. Never the token. */
export const auth = {
	get status() {
		return view.status;
	},
	get site() {
		return view.site;
	},
	get user() {
		return view.user;
	},
	/** Sync may run. Capture never checks this. */
	get canSync() {
		return canSync(view);
	}
};

export function completeSignIn(approved: ApprovedSignIn): void {
	save(signedIn(approved.site, approved.user, approved.token));
}

/** Forgets the token on this device. The site keeps the session until its idle window ends. */
export function signOut(): void {
	save(signedOut(stored));
}

export function markExpired(): void {
	save(expire(stored));
}

/** A bearer for `/api/v1`, minted from the session token. For sync. */
export async function bearer(): Promise<string> {
	const { site, token } = stored;
	if (!site || !token) throw new Error('Not signed in to Flow PT.');
	if (minter?.token !== token) minter = { token, mint: createSessionTokenAuth({ siteUrl: site, sessionToken: token }) };
	try {
		return await minter.mint();
	} catch (error) {
		if (isSessionRefused(error) && stored.token === token) markExpired();
		throw error;
	}
}
