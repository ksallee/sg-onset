import { describe, expect, it } from 'vitest';
import { appCacheName, cacheRule, isAppCache, MEDIA_CACHE, parseRange, precacheable } from './cache';

const origin = 'https://sg-onset.vercel.app';
const scope = { origin, precached: new Set(['/_app/immutable/a.js', '/sounds/manifest.json', '/icons/icon-192.png']) };
const at = (path: string, o = origin) => new URL(path, o);

describe('cacheRule', () => {
	it('serves precached app files from the precache', () => {
		expect(cacheRule(at('/_app/immutable/a.js'), scope)).toBe('precache');
		expect(cacheRule(at('/sounds/manifest.json'), scope)).toBe('precache');
	});
	it('keeps sounds and music cache-first', () => {
		expect(cacheRule(at('/sounds/el/bowl-1.mp3'), scope)).toBe('media');
		expect(cacheRule(at('/music/suno/peak-drums-132.mp3'), scope)).toBe('media');
	});
	it('ignores the query string when matching', () => {
		expect(cacheRule(at('/sounds/el/bowl-1.mp3?v=2'), scope)).toBe('media');
	});
	it('never caches the API', () => {
		expect(cacheRule(at('/api/freesound/search?q=gong'), scope)).toBe('bypass');
		expect(cacheRule(at('/api'), scope)).toBe('bypass');
	});
	it('leaves other origins alone', () => {
		expect(cacheRule(at('/sounds/x.mp3', 'https://cdn.freesound.org'), scope)).toBe('bypass');
	});
	it('leaves non-GET requests alone', () => {
		expect(cacheRule(at('/sounds/el/bowl-1.mp3'), scope, 'POST')).toBe('bypass');
	});
	it('sends pages and other files to the network first', () => {
		expect(cacheRule(at('/'), scope)).toBe('network');
		expect(cacheRule(at('/s/abc'), scope)).toBe('network');
		expect(cacheRule(at('/soundscape'), scope)).toBe('network');
	});
});

describe('precacheable', () => {
	it('takes app files and small statics', () => {
		expect(precacheable('/manifest.webmanifest')).toBe(true);
		expect(precacheable('/sounds/manifest.json')).toBe(true);
		expect(precacheable('/music/manifest.json')).toBe(true);
	});
	it('leaves launch images out: iPadOS fetches them itself', () => {
		expect(precacheable('/splash/ipad-11-landscape-dark.png')).toBe(false);
		expect(precacheable('/og.png')).toBe(false);
		expect(precacheable('/icons/icon-192.png')).toBe(true);
	});
	it('leaves audio to the media cache, fetched when first played', () => {
		expect(precacheable('/sounds/el/bowl-1.mp3')).toBe(false);
		expect(precacheable('/music/suno/peak-drums-132.mp3')).toBe(false);
		expect(precacheable('/sounds/amb/rain.wav')).toBe(false);
	});
});

describe('cache names', () => {
	it('names the app cache after the build version', () => {
		expect(appCacheName('123')).toBe('app-123');
	});
	it('marks old app caches for deletion, keeps the current one and the media cache', () => {
		expect(isAppCache('app-1')).toBe(true);
		expect(isAppCache(MEDIA_CACHE)).toBe(false);
	});
});

describe('parseRange', () => {
	it('reads a closed range', () => {
		expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
	});
	it('reads an open range to the end', () => {
		expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
	});
	it('reads a suffix range', () => {
		expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
		expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
	});
	it('clamps an end past the file', () => {
		expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
	});
	it('reads Safari’s probe of the first two bytes', () => {
		expect(parseRange('bytes=0-1', 1000)).toEqual({ start: 0, end: 1 });
	});
	it('rejects unsatisfiable or malformed ranges', () => {
		expect(parseRange('bytes=1000-', 1000)).toBeNull();
		expect(parseRange('bytes=5-2', 1000)).toBeNull();
		expect(parseRange('bytes=-0', 1000)).toBeNull();
		expect(parseRange('bytes=-', 1000)).toBeNull();
		expect(parseRange('items=0-1', 1000)).toBeNull();
		expect(parseRange('bytes=0-1,5-9', 1000)).toBeNull();
		expect(parseRange('bytes=0-1', 0)).toBeNull();
	});
});
