import { describe, expect, it } from 'vitest';
import { canSync, EMPTY, expire, isSessionRefused, parseStored, serializeStored, signedIn, signedOut, viewOf } from './state';

const SITE = 'https://studio.shotgrid.autodesk.com';

describe('viewOf', () => {
	it('reads signed out, signed in and expired, and never shows the token', () => {
		expect(viewOf(EMPTY)).toEqual({ status: 'signed-out', site: null, user: null });
		const live = signedIn(SITE, 'someone@example.com', 'tok');
		expect(viewOf(live)).toEqual({ status: 'signed-in', site: SITE, user: 'someone@example.com' });
		expect(viewOf(expire(live))).toEqual({ status: 'expired', site: SITE, user: 'someone@example.com' });
		expect(viewOf(signedOut(live))).toEqual({ status: 'signed-out', site: SITE, user: null });
	});
});

describe('transitions', () => {
	it('expiring drops the token and keeps who and where, for signing in again', () => {
		expect(expire(signedIn(SITE, 'u', 'tok'))).toEqual({ site: SITE, user: 'u', token: null });
	});

	it('expiring a signed-out state changes nothing', () => {
		expect(expire(EMPTY)).toEqual(EMPTY);
		expect(viewOf(expire(signedOut(signedIn(SITE, 'u', 't')))).status).toBe('signed-out');
	});

	it('signing out keeps only the site, so the field is filled next time', () => {
		expect(signedOut(signedIn(SITE, 'u', 'tok'))).toEqual({ site: SITE, user: null, token: null });
	});
});

describe('canSync', () => {
	it('is true only when signed in. Capture never asks.', () => {
		expect(canSync(viewOf(signedIn(SITE, 'u', 't')))).toBe(true);
		expect(canSync(viewOf(expire(signedIn(SITE, 'u', 't'))))).toBe(false);
		expect(canSync(viewOf(EMPTY))).toBe(false);
	});
});

describe('stored form', () => {
	it('round-trips', () => {
		const s = signedIn(SITE, 'u', 'tok');
		expect(parseStored(serializeStored(s))).toEqual(s);
	});

	it('reads nothing, junk or the wrong shape as signed out', () => {
		for (const raw of [null, '', 'nope', '[]', 'null', '{"site":5}', '{"v":2,"site":"https://a.shotgrid.autodesk.com"}']) {
			expect(parseStored(raw), String(raw)).toEqual(EMPTY);
		}
	});

	it('drops a stored site that is not a clean https origin', () => {
		const raw = JSON.stringify({ v: 1, site: 'http://evil.example', user: 'u', token: 't' });
		expect(parseStored(raw)).toEqual(EMPTY);
	});

	it('drops a token stored without its user', () => {
		const raw = JSON.stringify({ v: 1, site: SITE, user: null, token: 't' });
		expect(parseStored(raw)).toEqual({ site: SITE, user: null, token: null });
	});
});

describe('isSessionRefused', () => {
	// findings/126_session_idle.md: 400 code 102 "Can't authenticate session token ending with '<last 4>'".
	it('knows the refusal in the errors envelope and bare', () => {
		const item = { status: 400, code: 102, title: "Can't authenticate session token ending with '0000'", source: {} };
		expect(isSessionRefused({ status: 400, body: { errors: [item] } })).toBe(true);
		expect(isSessionRefused({ status: 400, body: item })).toBe(true);
	});

	it('is false for any other failure, offline included', () => {
		expect(isSessionRefused({ status: 400, body: { errors: [{ code: 103 }] } })).toBe(false);
		expect(isSessionRefused({ status: 500, body: { errors: [{ code: 102 }] } })).toBe(false);
		expect(isSessionRefused(new TypeError('Failed to fetch'))).toBe(false);
		expect(isSessionRefused(null)).toBe(false);
	});
});
