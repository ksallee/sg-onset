/**
 * The server half of "Send set data to artists" (#106): Flow PT's Action Menu Item posts here, and
 * the person's browser is sent on to the app page with four checked values.
 *
 * What it does with the form, and why, is `lib/send/request.ts`. Here:
 * - only a form is read, 1 MiB at most: `ids` lists every row of the Flow PT page;
 * - every answer is a 303 to the page, which says in words what went wrong, if anything;
 * - nothing is fetched, kept or logged. The form holds the person's login and session id, and none
 *   of it leaves this function.
 * The route takes a post from any origin (lib/server/csrf.ts): it writes nothing, so a forged post
 * can only open the page, where nothing is written until the person taps Send.
 */
import type { HostSettings } from '$lib/auth/site';
import { pagePath, problemPath, readActionForm, type RequestProblem } from '$lib/send/request';

const MAX_BODY = 1024 * 1024;
const FORM = 'application/x-www-form-urlencoded';

function to(location: string): Response {
	return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
const refuse = (problem: RequestProblem) => to(problemPath(problem));

/** The body as text, or null past `max` bytes. */
async function readCapped(request: Request, max: number): Promise<string | null> {
	if (!request.body) return '';
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let text = '';
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();
		size += value.byteLength;
		if (size > max) {
			await reader.cancel().catch(() => {});
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
}

export async function receiveAction(request: Request, settings: HostSettings): Promise<Response> {
	const type = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
	if (type !== FORM) return refuse('bad-request');
	if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return refuse('bad-request');
	const text = await readCapped(request, MAX_BODY).catch(() => null);
	if (text === null) return refuse('bad-request');
	const read = readActionForm(new URLSearchParams(text), settings);
	return read.ok ? to(pagePath(read.request)) : refuse(read.problem);
}
