// The sign-in screen as a state machine: the form, asking the site, waiting for the approval,
// approved. Every failure returns to the form with its reason; a lost network while a request is
// pending waits instead, since the request lives five minutes. Also: where to go back to, how
// the approval tab is opened, and whether the approval page is the site's own. Pure.

import type { PendingSignIn, SignInFailure } from '$lib/auth/sign-in';

export type TabState =
	/** The approval page was opened in a new tab. */
	| 'opened'
	/** The browser blocked the new tab: the person opens it from a link. */
	| 'blocked'
	/** No tab was tried (the Home Screen app): the person opens it from a link. */
	| 'link';

export type FlowState =
	| { step: 'form'; problem?: { code: SignInFailure; reason?: string } }
	| { step: 'asking'; host: string }
	| { step: 'waiting'; pending: PendingSignIn; tab: TabState; offline: boolean }
	| { step: 'approved'; user: string; site: string };

export type FlowEvent =
	| { type: 'submit'; host: string }
	| { type: 'requested'; pending: PendingSignIn; tab: TabState }
	| { type: 'approved'; user: string; site: string }
	| { type: 'failed'; code: SignInFailure; reason?: string }
	| { type: 'cancel' }
	/** The person opened the approval page from the link. */
	| { type: 'reopened' }
	| { type: 'online' }
	/** The site field changed. */
	| { type: 'edit' };

export const START: FlowState = { step: 'form' };

export function flow(state: FlowState, event: FlowEvent): FlowState {
	switch (event.type) {
		case 'submit':
			return state.step === 'form' ? { step: 'asking', host: event.host } : state;
		case 'requested':
			return state.step === 'asking' ? { step: 'waiting', pending: event.pending, tab: event.tab, offline: false } : state;
		case 'approved':
			return state.step === 'waiting' ? { step: 'approved', user: event.user, site: event.site } : state;
		case 'failed':
			if (state.step !== 'asking' && state.step !== 'waiting') return state;
			if (event.code === 'cancelled') return START;
			if (event.code === 'offline' && state.step === 'waiting') return { ...state, offline: true };
			return { step: 'form', problem: event.reason === undefined ? { code: event.code } : { code: event.code, reason: event.reason } };
		case 'cancel':
			return state.step === 'asking' || state.step === 'waiting' ? START : state;
		case 'reopened':
			return state.step === 'waiting' ? { ...state, tab: 'opened' } : state;
		case 'online':
			return state.step === 'waiting' && state.offline ? { ...state, offline: false } : state;
		case 'edit':
			return state.step === 'form' && state.problem ? START : state;
	}
}

/**
 * How the approval page opens. A browser only lets a page open a tab from the tap itself, and
 * the page's address comes a moment later: so an empty tab is opened on the tap and sent there
 * (`preopen`). From the Home Screen a new tab is a sheet over the app that the app cannot close
 * if asking fails: there the person opens it from a link.
 */
export function tabPlan(device: { standalone: boolean }): 'preopen' | 'link' {
	return device.standalone ? 'link' : 'preopen';
}

/** The approval page is an https page on the site that was asked. This app's server checks it too. */
export function approvalUrlOk(pending: Pick<PendingSignIn, 'site' | 'url'>): boolean {
	try {
		const url = new URL(pending.url);
		return url.protocol === 'https:' && url.origin === new URL(pending.site).origin;
	} catch {
		return false;
	}
}

const HOME = '/settings';
const NEVER = ['/', '/sign-in', '/welcome', '/auth'];

function ownPath(path: string | null): string | undefined {
	if (!path || !/^\/(?![/\\])/.test(path) || /[\\\s]/.test(path)) return undefined;
	const pathname = path.split(/[?#]/)[0];
	if (NEVER.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/')))) return undefined;
	return path;
}

/**
 * Where sign-in returns to: the `next` its link asked for, else the page the person came from,
 * else Settings. Only a path of this app, and never sign-in or the first run.
 */
export function returnPath(next: string | null, from: string | null): string {
	return ownPath(next) ?? ownPath(from) ?? HOME;
}

/** What a failure asks of the person: start again, wait for a network, fix the site, or nothing. */
export function failureKind(code: SignInFailure): 'expired' | 'offline' | 'site' | 'refused' | 'none' {
	switch (code) {
		case 'timeout':
		case 'gone':
			return 'expired';
		case 'offline':
			return 'offline';
		case 'bad-site':
		case 'not-allowed':
		case 'unreachable':
			return 'site';
		case 'cancelled':
			return 'none';
		default:
			return 'refused';
	}
}
