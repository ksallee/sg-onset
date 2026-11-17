// Flow PT's Action Menu Item "Send set data to artists" posts here (#106). Logic and checks in
// $lib/server/action-route.ts and $lib/send/request.ts. The allowlist is the sign-in's.
import { env } from '$env/dynamic/private';
import { receiveAction } from '$lib/server/action-route';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => receiveAction(request, { hosts: env.FPT_HOSTS, extraHosts: env.FPT_EXTRA_HOSTS });
