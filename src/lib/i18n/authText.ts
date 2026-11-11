// What a failed sign-in says. Pure.
import type { SignInFailure } from '$lib/auth/sign-in';
import type { SiteProblem } from '$lib/auth/site';
import { hasMessage, t } from './messages';

const PROBLEM: Record<SiteProblem, true> = {
	empty: true,
	'not-https': true,
	port: true,
	userinfo: true,
	path: true,
	ip: true,
	local: true,
	punycode: true,
	'not-ascii': true,
	invalid: true,
	'not-allowed': true
};

/** The text for a failure `code`; a `bad-site` says what is wrong with the address (`reason`). Cancelling says nothing. */
export function failureText(code: SignInFailure, reason?: string): string {
	if (code === 'cancelled') return '';
	if (code === 'bad-site') return t(`auth.problem.${reason && Object.hasOwn(PROBLEM, reason) ? (reason as SiteProblem) : 'invalid'}`);
	if (code === 'not-allowed') return t('auth.problem.not-allowed');
	const key = `auth.failure.${code}`;
	return hasMessage(key) ? t(key) : t('auth.failure.refused');
}
