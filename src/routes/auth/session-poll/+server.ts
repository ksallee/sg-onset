// Sign-in step two, forwarded to the person's Flow PT site. Logic and checks in
// $lib/server/launcher-proxy.ts.
import { env } from '$env/dynamic/private';
import { proxySessionPoll } from '$lib/server/launcher-proxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
	proxySessionPoll(request, { fetch: globalThis.fetch, extraHosts: env.FPT_EXTRA_HOSTS });
