import { describe, expect, it } from 'vitest';
import { jwtWith } from './testkit';
import { bearerExpiry, RENEW_MARGIN_MS, renewDue } from './token';

const NOW = Date.UTC(2026, 10, 11, 10, 0, 0);

describe('bearerExpiry', () => {
	// corpus findings/027_auth_permissions.md: a bearer is three segments, the second JSON; 133: `exp`.
	it('reads `exp` out of the bearer, in milliseconds', () => {
		expect(bearerExpiry(jwtWith({ exp: NOW / 1000 + 600 }))).toBe(NOW + 600_000);
	});

	it('is nothing for a token that does not decode', () => {
		expect(bearerExpiry('good-bearer')).toBeUndefined();
		expect(bearerExpiry('a.b.c')).toBeUndefined();
		expect(bearerExpiry(jwtWith({ user: { type: 'HumanUser', id: 1 } }))).toBeUndefined();
	});
});

describe('renewDue', () => {
	// findings/133: 200 at exp - 20 s, 401 at exp + 5 s. Renewed a margin before.
	it('renews a bearer inside the margin before its exp', () => {
		const exp = NOW / 1000 + 600;
		expect(renewDue(jwtWith({ exp }), NOW)).toBe(false);
		expect(renewDue(jwtWith({ exp }), NOW + 600_000 - RENEW_MARGIN_MS - 1)).toBe(false);
		expect(renewDue(jwtWith({ exp }), NOW + 600_000 - RENEW_MARGIN_MS)).toBe(true);
		expect(renewDue(jwtWith({ exp }), NOW + 700_000)).toBe(true);
	});

	it('leaves a token it cannot read alone: the site says when it is spent', () => {
		expect(renewDue('good-bearer', NOW)).toBe(false);
	});
});
