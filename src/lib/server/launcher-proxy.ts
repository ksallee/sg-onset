/**
 * The server half of sign-in: the App Session Launcher's two calls, forwarded.
 *
 * `/internal_api` answers no CORS header, so the browser cannot make these
 * calls itself (corpus findings/062_cors.md). Everything else, the bearer
 * included, the browser does directly against `/api/v1`.
 *
 * This is the only place the app's server talks to a Flow PT site, and it is
 * built so it cannot be used as a relay:
 * - the site must pass `checkSite`: https, a plain DNS name, on the allowlist
 *   (Autodesk-hosted by default, plus `FPT_EXTRA_HOSTS`);
 * - the method and path come from `launcher.ts`, never from the caller, and
 *   `forwardable` is checked once more before the fetch;
 * - redirects are not followed;
 * - the caller's cookies and headers are not forwarded, and nothing is kept;
 * - a call from another origin, a body that is not small JSON, is refused.
 *
 * Nothing here logs. The poll's answer carries the person's session token.
 */
import { checkSite } from '$lib/auth/site';
import {
	forwardable,
	proxyError,
	readSessionPoll,
	readSessionRequest,
	sessionPollCall,
	sessionRequestCall,
	type Forward,
	type ProxyAnswer
} from '$lib/auth/launcher';

export interface ProxyOptions {
	fetch: typeof fetch;
	/** `FPT_EXTRA_HOSTS`: hosts a self-hosted deploy allows beside Autodesk's. */
	extraHosts?: string;
	/** Give up on the site after this long. */
	timeoutMs?: number;
}

const MAX_BODY = 2048;
const TIMEOUT_MS = 10_000;

function respond({ status, body }: ProxyAnswer): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
}

type Intake = { origin: string; fields: Record<string, unknown> } | ProxyAnswer;

async function intake(request: Request, options: ProxyOptions): Promise<Intake> {
	// Same-origin only. A browser on another origin also fails the preflight that
	// a JSON body forces, since this server answers no CORS; this says so plainly.
	const from = request.headers.get('origin');
	if ((from !== null && from !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
		return proxyError('cross-origin');
	}
	if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return proxyError('unsupported-type');
	if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return proxyError('too-large');

	const text = await request.text().catch(() => null);
	if (text === null) return proxyError('bad-request');
	if (text.length > MAX_BODY) return proxyError('too-large');
	let fields: unknown;
	try {
		fields = JSON.parse(text);
	} catch {
		return proxyError('bad-request');
	}
	if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return proxyError('bad-request');
	const site = (fields as Record<string, unknown>).site;
	if (typeof site !== 'string') return proxyError('bad-request');

	const checked = checkSite(site, options.extraHosts);
	if (!checked.ok) return checked.reason === 'not-allowed' ? proxyError('not-allowed') : proxyError('bad-site', { reason: checked.reason });
	return { origin: checked.origin, fields: fields as Record<string, unknown> };
}

async function forward(
	origin: string,
	call: Forward,
	options: ProxyOptions,
	read: (status: number, text: string) => ProxyAnswer
): Promise<ProxyAnswer> {
	const url = new URL(call.path, origin);
	if (!forwardable(call.method, call.path) || url.origin !== origin) return proxyError('bad-request');

	const headers: Record<string, string> = { accept: 'application/json' };
	let body: string | undefined;
	if (call.form) {
		// The launcher takes form or JSON (findings/052); form, as sg-widgets-core sends it.
		headers['content-type'] = 'application/x-www-form-urlencoded';
		body = new URLSearchParams(call.form).toString();
	}

	let res: Response;
	try {
		res = await options.fetch(url, {
			method: call.method,
			headers,
			body,
			redirect: 'manual',
			signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS)
		});
	} catch {
		return proxyError('unreachable');
	}
	// `manual` hands back the 3xx itself (Node) or an opaque redirect (browsers): never followed.
	if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return proxyError('redirect');
	let text: string;
	try {
		text = await res.text();
	} catch {
		return proxyError('unreachable');
	}
	return read(res.status, text);
}

/** Step one: `{site}` in, `{id, url}` out. `url` is the approval page on that site. */
export async function proxySessionRequest(request: Request, options: ProxyOptions): Promise<Response> {
	const got = await intake(request, options);
	if ('status' in got) return respond(got);
	return respond(await forward(got.origin, sessionRequestCall(), options, (s, t) => readSessionRequest(s, t, got.origin)));
}

/** Step two: `{site, id}` in; `{approved: false}`, `{approved: true, sessionToken, userLogin}` or 404 out. */
export async function proxySessionPoll(request: Request, options: ProxyOptions): Promise<Response> {
	const got = await intake(request, options);
	if ('status' in got) return respond(got);
	const call = sessionPollCall(got.fields.id);
	if (!call) return respond(proxyError('bad-request'));
	return respond(await forward(got.origin, call, options, readSessionPoll));
}
