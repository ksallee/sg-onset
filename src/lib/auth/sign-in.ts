/**
 * The browser half of sign-in, through this app's two endpoints under `/auth/`.
 *
 * Ask for a session request, show the person the approval page on their site,
 * poll until they approve, and hand back the session token from the one answer
 * that holds it. A pending request lives about five minutes, then the poll is
 * 404 (corpus findings/052_app_session_launcher.md). No password crosses this
 * app: the person signs in to Flow PT itself, on the approval page.
 *
 * I/O is injected (`fetch`, `sleep`, `now`), so the flow is tested without a site.
 */
import { normalizeSite } from './site';

export type SignInFailure = 'bad-site' | 'not-allowed' | 'gone' | 'timeout' | 'offline' | 'unreachable' | 'refused' | 'cancelled';

export class SignInError extends Error {
	constructor(
		readonly code: SignInFailure,
		readonly reason?: string
	) {
		super(reason ? `${code}: ${reason}` : code);
		this.name = 'SignInError';
	}
}

export interface SignInDeps {
	fetch: typeof fetch;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	now?: () => number;
	signal?: AbortSignal;
	intervalMs?: number;
	timeoutMs?: number;
}

export interface PendingSignIn {
	/** The site's origin. */
	site: string;
	id: string;
	/** The approval page, on the site itself (checked by the server). */
	url: string;
}

export interface ApprovedSignIn {
	site: string;
	user: string;
	token: string;
}

const INTERVAL_MS = 2000;
/** findings/052: nobody approves, 404 after 305 s. */
const TIMEOUT_MS = 300_000;

const wait = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
	});

async function post(path: string, body: unknown, deps: SignInDeps): Promise<Record<string, unknown>> {
	if (deps.signal?.aborted) throw new SignInError('cancelled');
	let res: Response;
	try {
		res = await deps.fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify(body),
			signal: deps.signal
		});
	} catch {
		throw new SignInError(deps.signal?.aborted ? 'cancelled' : 'offline');
	}
	const answer = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (deps.signal?.aborted) throw new SignInError('cancelled');
	if (res.ok && answer) return answer;
	const error = typeof answer?.error === 'string' ? answer.error : undefined;
	if (error === 'bad-site') throw new SignInError('bad-site', typeof answer?.reason === 'string' ? answer.reason : undefined);
	if (error === 'not-allowed' || error === 'gone' || error === 'unreachable') throw new SignInError(error);
	throw new SignInError('refused', error);
}

/** Step one. Checks the site's form here too, so a typo answers at once and offline. */
export async function requestSignIn(input: string, deps: SignInDeps): Promise<PendingSignIn> {
	const site = normalizeSite(input);
	if (!site.ok) throw new SignInError('bad-site', site.reason);
	const answer = await post('/auth/session-request', { site: site.origin }, deps);
	if (typeof answer.id !== 'string' || typeof answer.url !== 'string') throw new SignInError('refused');
	return { site: site.origin, id: answer.id, url: answer.url };
}

/** Step two. Resolves once the person approves on their site. */
export async function waitForApproval(pending: PendingSignIn, deps: SignInDeps): Promise<ApprovedSignIn> {
	const sleep = deps.sleep ?? wait;
	const now = deps.now ?? Date.now;
	const interval = deps.intervalMs ?? INTERVAL_MS;
	const deadline = now() + (deps.timeoutMs ?? TIMEOUT_MS);
	for (;;) {
		await sleep(interval, deps.signal);
		const answer = await post('/auth/session-poll', { site: pending.site, id: pending.id }, deps);
		if (answer.approved === true && typeof answer.sessionToken === 'string' && typeof answer.userLogin === 'string') {
			return { site: pending.site, user: answer.userLogin, token: answer.sessionToken };
		}
		if (now() >= deadline) throw new SignInError('timeout');
	}
}
