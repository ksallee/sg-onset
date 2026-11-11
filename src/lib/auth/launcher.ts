/**
 * The App Session Launcher calls this app's server makes, and what it answers.
 *
 * A person signs in with no password and no script key: ask the site for a
 * session request, show them its approval page, poll until they approve, and
 * keep the session token the poll hands out once
 * (corpus findings/052_app_session_launcher.md, endpoints
 * post_internal_api_app_session_request.md and
 * put_internal_api_app_session_request_id.md). Those two calls are under
 * `/internal_api`, which answers no CORS header, so a page on another origin
 * cannot make them (findings/062_cors.md). They are the only calls the proxy
 * forwards: `forwardable` is the allowlist, checked before every fetch. The
 * bearer itself is minted by the browser at `/api/v1/auth/access_token`, which
 * does answer CORS (findings/062).
 *
 * Pure: no I/O.
 */

/** The name the person sees on the approval page. Fixed here, never taken from the caller. */
export const APP_NAME = 'SG OnSet';
/** Identifies this client to the site. Not shown to the person. */
export const MACHINE_ID = 'sg-onset';
export const LAUNCHER_PATH = '/internal_api/app_session_request';
/** A request id goes in a path segment, so it may not carry one of its own. */
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** The approval page: `<site>/app_session_request/<id>?sticky_id=<id>` (findings/052). */
const APPROVAL_PATH = /^\/app_session_request\/[A-Za-z0-9_-]{1,128}$/;

export interface Forward {
	method: 'POST' | 'PUT';
	path: string;
	form?: Record<string, string>;
}

export function sessionRequestCall(): Forward {
	return { method: 'POST', path: LAUNCHER_PATH, form: { appName: APP_NAME, machineId: MACHINE_ID } };
}

export function sessionPollCall(id: unknown): Forward | null {
	return typeof id === 'string' && REQUEST_ID.test(id) ? { method: 'PUT', path: `${LAUNCHER_PATH}/${id}` } : null;
}

/** The method and path allowlist. Anything else the proxy refuses to send. */
export function forwardable(method: string, path: string): boolean {
	if (method === 'POST') return path === LAUNCHER_PATH;
	if (method === 'PUT') {
		const prefix = `${LAUNCHER_PATH}/`;
		return path.startsWith(prefix) && REQUEST_ID.test(path.slice(prefix.length));
	}
	return false;
}

export type ProxyErrorCode =
	| 'bad-request'
	| 'bad-site'
	| 'not-allowed'
	| 'cross-origin'
	| 'unsupported-type'
	| 'too-large'
	| 'gone'
	| 'redirect'
	| 'upstream'
	| 'unreachable'
	| 'bad-answer';

const STATUS: Record<ProxyErrorCode, number> = {
	'bad-request': 400,
	'bad-site': 400,
	'not-allowed': 403,
	'cross-origin': 403,
	'unsupported-type': 415,
	'too-large': 413,
	gone: 404,
	redirect: 502,
	upstream: 502,
	unreachable: 502,
	'bad-answer': 502
};

export interface ProxyAnswer {
	status: number;
	body: Record<string, unknown>;
}

export function proxyError(error: ProxyErrorCode, extra: Record<string, unknown> = {}): ProxyAnswer {
	return { status: STATUS[error], body: { error, ...extra } };
}

function parse(text: string): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(text);
		return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

const upstream = (status: number): ProxyAnswer => proxyError('upstream', { upstreamStatus: status });

/** True when `url` is the approval page on the very site the request went to. */
function isApprovalPage(url: unknown, origin: string): url is string {
	if (typeof url !== 'string') return false;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	return parsed.origin === origin && parsed.username === '' && parsed.password === '' && APPROVAL_PATH.test(parsed.pathname);
}

/** Step one's answer. The page the person is sent to must be on their own site. */
export function readSessionRequest(status: number, text: string, origin: string): ProxyAnswer {
	if (status < 200 || status > 299) return upstream(status);
	const body = parse(text);
	const id = body?.sessionRequestId;
	if (typeof id !== 'string' || !REQUEST_ID.test(id) || !isApprovalPage(body?.url, origin)) return proxyError('bad-answer');
	return { status: 200, body: { id, url: body.url } };
}

/**
 * Step two's answer: pending, approved with the token, or gone. 404 covers a
 * request spent, denied, forgotten or never made (findings/052).
 */
export function readSessionPoll(status: number, text: string): ProxyAnswer {
	if (status === 404) return proxyError('gone');
	if (status < 200 || status > 299) return upstream(status);
	const body = parse(text);
	if (body?.approved === false) return { status: 200, body: { approved: false } };
	const { sessionToken, userLogin } = body ?? {};
	if (body?.approved !== true || typeof sessionToken !== 'string' || !sessionToken || typeof userLogin !== 'string' || !userLogin) {
		return proxyError('bad-answer');
	}
	return { status: 200, body: { approved: true, sessionToken, userLogin } };
}
