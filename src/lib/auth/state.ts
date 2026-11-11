/**
 * Who is signed in to which Flow PT site, as the rest of the app reads it.
 *
 * Three states: signed out, signed in, expired. Expired keeps the site and the
 * person, so signing in again is one approval. Capture never reads this; only
 * sync does (`canSync`). The session token is in the stored form and never in
 * the view.
 *
 * The session token is the credential and the 600 s bearer is disposable
 * (corpus findings/052_app_session_launcher.md, findings/001_auth.md). The site
 * refuses a session left idle past its window, or revoked, with 400 code 102 at
 * the token endpoint (findings/126_session_idle.md); that is the only signal
 * of expiry, since no API read exposes the window.
 *
 * Pure: no I/O.
 */
import { normalizeSite } from './site';

export type AuthStatus = 'signed-out' | 'signed-in' | 'expired';

export interface AuthView {
	status: AuthStatus;
	/** The site's origin, `https://<host>`. */
	site: string | null;
	/** The launcher's `userLogin`: an email on an Autodesk Identity site. */
	user: string | null;
}

export interface StoredAuth {
	site: string | null;
	user: string | null;
	/** The launcher's `sessionToken`. A credential for the person who approved. */
	token: string | null;
}

export const EMPTY: StoredAuth = { site: null, user: null, token: null };

export function viewOf(s: StoredAuth): AuthView {
	const status: AuthStatus = s.site && s.user ? (s.token ? 'signed-in' : 'expired') : 'signed-out';
	return { status, site: s.site, user: status === 'signed-out' ? null : s.user };
}

export function signedIn(site: string, user: string, token: string): StoredAuth {
	return { site, user, token };
}

export function expire(s: StoredAuth): StoredAuth {
	return s.user ? { ...s, token: null } : s;
}

export function signedOut(s: StoredAuth): StoredAuth {
	return { site: s.site, user: null, token: null };
}

/** Sync needs a live session. Nothing else in the app does. */
export function canSync(view: AuthView): boolean {
	return view.status === 'signed-in';
}

const VERSION = 1;

export function serializeStored(s: StoredAuth): string {
	return JSON.stringify({ v: VERSION, ...s });
}

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** What was kept on the device. Anything unreadable is signed out. */
export function parseStored(raw: string | null): StoredAuth {
	if (!raw) return EMPTY;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return EMPTY;
	}
	if (value === null || typeof value !== 'object' || (value as { v?: unknown }).v !== VERSION) return EMPTY;
	const { site, user, token } = value as Record<string, unknown>;
	const checked = typeof site === 'string' ? normalizeSite(site) : null;
	if (!checked?.ok || checked.origin !== site) return EMPTY;
	const who = text(user);
	return { site: checked.origin, user: who, token: who ? text(token) : null };
}

/**
 * True when the token endpoint refused the session token itself: 400 code 102
 * (findings/126). Whether an idle-expired token answers the same is unmeasured;
 * an expired, revoked and mistyped token read alike there. Takes an
 * `SgApiError`-shaped value: `{status, body}`.
 */
export function isSessionRefused(error: unknown): boolean {
	if (error === null || typeof error !== 'object') return false;
	const { status, body } = error as { status?: unknown; body?: unknown };
	if (status !== 400 || body === null || typeof body !== 'object') return false;
	const errors = (body as { errors?: unknown }).errors;
	const first = Array.isArray(errors) ? errors[0] : body;
	return first !== null && typeof first === 'object' && (first as { code?: unknown }).code === 102;
}
