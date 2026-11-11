// What an answer that is not a yes means. Pure.
//
// Every `/api/v1` error is `{"errors": [{status, code, title, source, detail}]}` (corpus
// findings/126_session_idle.md, recipes/002_batch.md). The title is the only place most refusals
// say what they are, so the titles the corpus measured are matched here and nowhere else.

import type { TransportErrorKind } from '$lib/outbox/transport';

export type ApiFailure = { status: number; code?: number; title: string };

/** The first error of a body, whatever the body is. A 404 says what is missing in its `detail`. */
export function failureOf(status: number, body: unknown): ApiFailure {
	const fallback = { status, title: `HTTP ${status}` };
	if (body === null || typeof body !== 'object') return fallback;
	const errors = (body as { errors?: unknown }).errors;
	const first: unknown = Array.isArray(errors) ? errors[0] : body;
	if (first === null || typeof first !== 'object') return fallback;
	const { code, title, detail, message } = first as Record<string, unknown>;
	// A schema write's 500 puts a traceback in `detail` and its meaning in `title` (findings/132).
	const words = typeof detail === 'string' && detail.startsWith('{traceback') ? undefined : detail;
	const said = [words, title, message].find((t) => typeof t === 'string' && t !== '') as string | undefined;
	return { status, ...(typeof code === 'number' ? { code } : {}), title: said ?? fallback.title };
}

/**
 * A create refused because its client UUID is already there: 400 code 104, "... field is
 * required to be unique". Code 104 alone is the general create failure, so the phrase is matched
 * too (corpus findings/127_retry_and_client_uuid.md, recipes/025_retry_safe_create.md).
 */
export function isUniqueRefusal(failure: ApiFailure): boolean {
	return failure.status === 400 && failure.code === 104 && failure.title.includes('required to be unique');
}

/** The record a batch's 404 names: "Entity of type [Version] with id=N does not exist." (recipes/002). */
export function missingRecord(failure: ApiFailure): { entityType: string; id: number } | undefined {
	if (failure.status !== 404) return undefined;
	const match = /Entity of type \[(\w+)\] with id=(\d+) does not exist/.exec(failure.title);
	return match ? { entityType: match[1], id: Number(match[2]) } : undefined;
}

/** The field a 400 names: `[Version.entity]`, or `Version.frame_count expected ...` (recipes/002, field_types). */
export function blamedField(failure: ApiFailure): { entityType: string; field: string } | undefined {
	const match = /\[(\w+)\.(\w+)\]/.exec(failure.title) ?? /\b([A-Z]\w*)\.(\w+)\b/.exec(failure.title);
	return match ? { entityType: match[1], field: match[2] } : undefined;
}

/** The site refused the session itself: 400 code 102 (corpus findings/126_session_idle.md). */
export function isSessionRefusal(failure: ApiFailure): boolean {
	return failure.status === 400 && failure.code === 102;
}

/**
 * A bearer the site will not take. Every one is 401 code 102 `Unauthorized`, with no
 * `WWW-Authenticate`; only `detail` differs: `Token Expired` from the second past `exp`,
 * `Token invalid` for a forged one, null for garbage or none (corpus findings/133_bearer_expiry.md).
 * `failureOf` lifts `detail` into the title.
 * - `expired`: a new bearer fixes it.
 * - `invalid`: the client sends the wrong thing; minting may not help.
 */
export function bearerRefusal(failure: ApiFailure): 'expired' | 'invalid' | undefined {
	if (failure.status !== 401 || failure.code !== 102) return undefined;
	return failure.title === 'Token Expired' ? 'expired' : 'invalid';
}

/**
 * A field create refused for want of rights: 500 code 105, "API schema_field_create()
 * RuntimeError: User doesn't have permission to create a Field", a traceback in `detail`
 * (corpus findings/132_field_create_rights.md, an Artist; an Admin gets 201).
 */
export function isFieldCreateRefusal(failure: ApiFailure): boolean {
	return failure.status === 500 && failure.code === 105 && failure.title.includes("User doesn't have permission to create a Field");
}

/**
 * A row write refused for want of rights: 400 code 104 naming the type or the field (corpus
 * findings/143_nonadmin_rows.md, an Artist on custom entities and Attachments; findings/094 on
 * Task and Shot):
 * - "Entity of type <T> cannot be created by this user."
 * - "Entity of type <T> can not be deleted by this user."
 * - "The field is not editable for this user: [<T>.<field>]."
 */
export function rowRefusal(failure: ApiFailure): { action: 'create' | 'update' | 'delete'; entityType: string; field?: string } | undefined {
	if (failure.status !== 400 || failure.code !== 104) return undefined;
	const created = /Entity of type (\w+) can ?not be created by this user/.exec(failure.title);
	if (created) return { action: 'create', entityType: created[1] };
	const deleted = /Entity of type (\w+) can ?not be deleted by this user/.exec(failure.title);
	if (deleted) return { action: 'delete', entityType: deleted[1] };
	const edited = /not editable for this user: \[(\w+)\.(\w+)\]/.exec(failure.title);
	if (edited) return { action: 'update', entityType: edited[1], field: edited[2] };
	return undefined;
}

/**
 * The caller may not do this, in looser words: the fallback when the exact answers above do not
 * match. Measured: a 400 naming the entity or the field with "by this user" or "for this user"
 * (corpus findings/094_permission_preflight.md, 143), a 401 naming the level, "Must sudo as
 * Administrator" (findings/027_auth_permissions.md), and "doesn't have permission" on a schema
 * write (findings/132). A 403 is a guard, never seen.
 */
export function isPermissionRefusal(failure: ApiFailure): boolean {
	if (failure.status === 403) return true;
	return /this user|administrator|permission|not allowed|not permitted|forbidden/i.test(failure.title);
}

/**
 * A status that is not an answer about the request, as a transport error kind.
 * - 401: no valid bearer. An expired one is renewed and sent again before this (api.ts).
 * - 429, 5xx: a passing failure. A rate limit was never seen, not at 60 GETs in 1.9 s nor at 28
 *   mixed requests a second for 10 s (corpus findings/128_rate_limit.md,
 *   findings/144_rate_limit_burst.md), so both are retried with backoff.
 * - 502, 504 on a write: a gateway gave up, and the site may have committed all the same, as an
 *   abandoned batch does (findings/127). Checked, not resent.
 */
export function statusKind(status: number, mode: 'read' | 'write'): TransportErrorKind | undefined {
	if (status === 401) return 'unauthorized';
	if ((status === 502 || status === 504) && mode === 'write') return 'timeout';
	if (status === 429 || status >= 500) return 'failed';
	return undefined;
}

/** A request that got no answer at all. */
export function networkKind(at: { online: boolean; aborted: boolean; mode: 'read' | 'write' }): TransportErrorKind {
	if (!at.online) return 'unreachable';
	if (at.aborted) return 'timeout';
	return at.mode === 'write' ? 'timeout' : 'unreachable';
}
