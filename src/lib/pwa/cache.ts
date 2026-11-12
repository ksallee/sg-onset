// What the service worker does with each request, and the byte ranges it answers from cache.
// Pure; `src/service-worker.ts` is the I/O.
//
// - `precache`: the build and small static files, cached at install under `app-<version>`, a
//   new cache per deploy, old ones deleted on activate.
// - `media`: `/sounds/**` and `/music/**` audio, cache-first, cached when first fetched, in one
//   cache that outlives deploys (43 MB is not re-downloaded per deploy). A file replaced in place
//   under the same name needs MEDIA_CACHE bumped.
// - `network`: pages and anything else of ours: network first, the cached copy when offline.
// - `bypass`: the API (never cached), other origins, non-GET: the worker does not touch them.

export type CacheRule = 'precache' | 'media' | 'network' | 'bypass';

export const MEDIA_CACHE = 'media-v1';
const APP_PREFIX = 'app-';

export const appCacheName = (version: string) => `${APP_PREFIX}${version}`;
export const isAppCache = (name: string) => name.startsWith(APP_PREFIX);

const MEDIA_DIRS = /^\/(sounds|music)\//;
const AUDIO = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i;

/** Whether a static file goes in the install-time precache: all but the audio, the launch images and the link preview image. */
export function precacheable(path: string): boolean {
	if (path.startsWith('/splash/') || path === '/og.png') return false;
	return !(MEDIA_DIRS.test(path) && AUDIO.test(path));
}

export function cacheRule(url: URL, scope: { origin: string; precached: ReadonlySet<string> }, method = 'GET'): CacheRule {
	if (method !== 'GET' || url.origin !== scope.origin) return 'bypass';
	const path = url.pathname;
	if (path === '/api' || path.startsWith('/api/')) return 'bypass';
	if (scope.precached.has(path)) return 'precache';
	if (MEDIA_DIRS.test(path)) return 'media';
	return 'network';
}

/**
 * The inclusive byte span a `Range` header asks of a file `size` bytes long, or null when it
 * cannot be met from one span (malformed, several spans, past the end): the worker then answers
 * 416 or goes to the network.
 */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m || size <= 0) return null;
	const [, a, b] = m;
	if (a === '' && b === '') return null;
	if (a === '') {
		const n = Number(b);
		if (n === 0) return null;
		return { start: Math.max(0, size - n), end: size - 1 };
	}
	const start = Number(a);
	const end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
	if (start >= size || end < start) return null;
	return { start, end };
}
