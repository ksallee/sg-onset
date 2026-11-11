/**
 * Sign-in copy. Kept here until the i18n catalogue lands; then it moves there.
 */
import type { SiteProblem } from './site';
import type { SignInFailure } from './sign-in';

export const SIGN_IN = {
	title: 'Sign In',
	back: 'Back',
	siteHeader: 'Flow PT Site',
	sitePlaceholder: 'studio.shotgrid.autodesk.com',
	siteLabel: 'Flow PT site',
	siteFooter: 'Your studio’s site address. You approve the sign-in on your site. This app never sees your password.',
	continue: 'Continue',
	asking: 'Asking your site…',
	waitingHeader: 'Approve',
	waiting: 'Waiting for approval',
	waitingFooter: 'Open your site, sign in if it asks, and approve sg-onset. Come back here after.',
	open: 'Open Flow PT',
	cancel: 'Cancel',
	signedInHeader: 'Signed In',
	site: 'Site',
	user: 'Account',
	signOut: 'Sign Out',
	signedInFooter: 'Sync uses this account. Capture works signed in or not.',
	expired: 'Your session expired. Approve again to sync. Capture keeps working.',
	signedOutFooter: 'Capture works without signing in. Sync needs it.'
} as const;

const SITE_PROBLEM: Record<SiteProblem, string> = {
	empty: 'Type your Flow PT site.',
	'not-https': 'Use the https address of your site.',
	port: 'Leave out the port.',
	userinfo: 'Type the site only, with no name or password in it.',
	path: 'Type the site only, with nothing after its name.',
	ip: 'Type the site’s name, not an IP address.',
	local: 'That is a local address. Type your Flow PT site.',
	punycode: 'Type the site in plain letters.',
	'not-ascii': 'Type the site in plain letters.',
	invalid: 'That is not a site address.',
	'not-allowed': 'This app signs in to Autodesk-hosted Flow PT sites only. A self-hosted deploy can allow others.'
};

const FAILURE: Record<SignInFailure, string> = {
	'bad-site': SITE_PROBLEM.invalid,
	'not-allowed': SITE_PROBLEM['not-allowed'],
	gone: 'The request expired or was refused. Try again.',
	timeout: 'Nobody approved the request. Try again.',
	offline: 'No network. Signing in needs one. Capture works without.',
	unreachable: 'Your site did not answer. Check the address.',
	refused: 'Your site refused the request. Check the address.',
	cancelled: ''
};

export function failureText(code: SignInFailure, reason?: string): string {
	if (code === 'bad-site' && reason && reason in SITE_PROBLEM) return SITE_PROBLEM[reason as SiteProblem];
	return FAILURE[code];
}
