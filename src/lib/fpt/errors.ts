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
	const said = [detail, title, message].find((t) => typeof t === 'string' && t !== '') as string | undefined;
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
 * The caller may not do this. Measured: a 400 naming the entity or the field with "by this user"
 * or "for this user" (corpus findings/094_permission_preflight.md), and a 401 naming the level,
 * "Must sudo as Administrator" (findings/027_auth_permissions.md). What a schema write answers a
 * person who is not an admin is not in the corpus: 403 and the words below are a guard, not a
 * measurement.
 */
export function isPermissionRefusal(failure: ApiFailure): boolean {
	if (failure.status === 403) return true;
	return /this user|administrator|permission|not allowed|not permitted|forbidden/i.test(failure.title);
}

/**
 * A status that is not an answer about the request, as a transport error kind.
 * - 401: no valid bearer.
 * - 429, 5xx: a passing failure. Neither a rate limit nor its status was ever seen (corpus
 *   findings/128_rate_limit.md), so both are retried with backoff.
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
