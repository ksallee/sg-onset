// The service worker: the app shell opens offline. Rules in `$lib/pwa/cache.ts`, after
// holosession's worker without its audio cache. SvelteKit registers it, in `pnpm dev` too (as a
// module); there it caches nothing and clears what an earlier build left, so dev always sees
// fresh files.
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';
import { appCacheName, cacheRule, isAppCache, precacheable } from '$lib/pwa/cache';

const sw = self as unknown as ServiceWorkerGlobalScope;
const DEV = import.meta.env.DEV;
const APP = appCacheName(version);
// The page shell: every route is client-rendered (ssr = false), so `/` opens any of them offline.
const SHELL = '/';
const PRECACHE = [...build, ...files.filter(precacheable), SHELL];
const precached = new Set(PRECACHE);

// A new deploy takes over at once, without waiting for every tab to close; the layout reloads
// open pages on their next navigation (`updated`).
sw.addEventListener('install', (event) => {
	if (DEV) return;
	event.waitUntil(caches.open(APP).then((c) => c.addAll(PRECACHE)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	// Old deploys' app caches go. In dev, everything goes.
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => DEV || (isAppCache(k) && k !== APP)).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	if (DEV) return;
	const { request } = event;
	const url = new URL(request.url);
	const rule = cacheRule(url, { origin: sw.location.origin, precached }, request.method);
	if (rule === 'bypass') return;
	if (rule === 'precache') event.respondWith(fromPrecache(request, url));
	else event.respondWith(networkFirst(request));
});

async function fromPrecache(request: Request, url: URL): Promise<Response> {
	return (await (await caches.open(APP)).match(url.pathname)) ?? fetch(request);
}

/** Pages and the rest: the network, kept for offline; offline, the kept copy or the shell. */
async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(APP);
	try {
		const res = await fetch(request);
		if (res.status === 200 && res.type === 'basic') await cache.put(request, res.clone());
		return res;
	} catch (e) {
		const kept = (await cache.match(request)) ?? (request.mode === 'navigate' ? await cache.match(SHELL) : undefined);
		if (kept) return kept;
		throw e;
	}
}
