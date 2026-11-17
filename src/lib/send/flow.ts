// The page of "Send set data to artists" (#106): whether the person must sign in first, and what a
// failure asks of them. Pure.

import type { AuthStatus } from '$lib/auth/state';
import { TransportError } from '$lib/outbox/transport';

/**
 * - `ready`: signed in to the site Flow PT named.
 * - `signIn`: signed out: sign in to it.
 * - `expired`: that site's session ended: sign in again.
 * - `other`: signed in to another site. Signing in to this one replaces that session on the device.
 */
export type SessionNeed = 'ready' | 'signIn' | 'expired' | 'other';

export function sessionNeed(auth: { status: AuthStatus; site: string | null }, site: string): SessionNeed {
	if (auth.site === site) return auth.status === 'signed-in' ? 'ready' : auth.status === 'expired' ? 'expired' : 'signIn';
	return auth.status === 'signed-in' ? 'other' : 'signIn';
}

/**
 * - `offline`: no network.
 * - `unreachable`: Flow PT did not answer.
 * - `session`: the session was refused: sign in again.
 * - `setup`: the site is not set up for SG OnSet: an admin runs Set Up Fields.
 * - `refused`: Flow PT refused.
 */
export type SendFailure = 'offline' | 'unreachable' | 'session' | 'setup' | 'refused';

/** What a failure of a step means. `schema`: reading the site's schema, where a site not set up fails. */
export function failureOf(error: unknown, at: { online: boolean; step: 'schema' | 'read' }): SendFailure {
	if (!(error instanceof TransportError)) return 'refused';
	if (error.kind === 'unreachable' || error.kind === 'timeout') return at.online ? 'unreachable' : 'offline';
	if (error.kind === 'unauthorized') return 'session';
	if (at.step === 'schema' && error.kind === 'failed' && /not set up/.test(error.message)) return 'setup';
	return 'refused';
}
