// The bearer's life. Pure.
//
// A bearer is three base64url segments, the second the claims (corpus
// findings/027_auth_permissions.md). It lives 600 s, `exp` is honoured to the second: 200 at
// 20 s before it, 401 `Token Expired` at 5 s after (findings/133_bearer_expiry.md). So it is
// renewed a margin before its `exp`, and the margin covers a device clock a little off.

/** How long before its `exp` a bearer is renewed. */
export const RENEW_MARGIN_MS = 60_000;

/** The bearer's `exp`, in milliseconds, or nothing when it does not decode. */
export function bearerExpiry(token: string): number | undefined {
	const claims = token.split('.')[1];
	if (!claims) return undefined;
	try {
		const padded = claims.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (claims.length % 4)) % 4);
		const exp = (JSON.parse(atob(padded)) as { exp?: unknown } | null)?.exp;
		return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : undefined;
	} catch {
		return undefined;
	}
}

/** Whether to ask for a new bearer before sending this one. A token that does not decode is sent: the site says when it is spent. */
export function renewDue(token: string, now: number, margin = RENEW_MARGIN_MS): boolean {
	const exp = bearerExpiry(token);
	return exp !== undefined && now >= exp - margin;
}
