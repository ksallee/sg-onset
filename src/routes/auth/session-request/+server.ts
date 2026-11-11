// Sign-in step one, forwarded to the person's Flow PT site. Logic and checks in
// $lib/server/launcher-proxy.ts.
import { env } from '$env/dynamic/private';
import { proxySessionRequest } from '$lib/server/launcher-proxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
	proxySessionRequest(request, { fetch: globalThis.fetch, extraHosts: env.FPT_EXTRA_HOSTS });
