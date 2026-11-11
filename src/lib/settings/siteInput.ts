// What a person types or pastes in the site field of sign-in, made into the site's host before
// it is checked. People paste the address bar: a scheme, a page path, capitals, a stray space.
// Those are safe to drop, since the app only ever speaks https to the host itself. What changes
// where the request would go (a port, a name and password, another scheme) is left as typed, so
// `normalizeSite` ($lib/auth/site) refuses it and the exact reason can be said. Pure.

import { normalizeSite, type SiteProblem } from '$lib/auth/site';

/** Autodesk-hosted Flow PT: what a bare studio name is completed with. */
export const HOSTED_SUFFIX = '.shotgrid.autodesk.com';

/** Spaces of every kind, and the invisible characters a paste carries. */
const BLANK = /[\s ​-‍⁠﻿]+/g;
/** What wraps a pasted address in a chat or a mail. */
const WRAP = /^[<"'`(\[]+|[>"'`)\],;]+$/g;

/** The host a person meant, or what they typed with the blanks out when it is not safe to fix. */
export function tidySite(input: string): string {
	let text = input.replace(BLANK, '').replace(WRAP, '');
	if (text === '') return '';
	const scheme = /^([a-z][a-z0-9+.-]*):\/+/i.exec(text);
	if (scheme) {
		// Another scheme is never a site: leave it for the check to refuse.
		if (!/^https?$/i.test(scheme[1])) return text;
		text = text.slice(scheme[0].length);
	}
	const end = text.search(/[/?#]/);
	let host = end === -1 ? text : text.slice(0, end);
	// A name and password stay, with the page path, so the refusal is about them.
	if (host.includes('@')) return text;
	host = host.replace(/:443$/, '').replace(/\.+$/, '').toLowerCase();
	if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(host) && !/^[0-9]+$/.test(host) && host !== 'localhost') return host + HOSTED_SUFFIX;
	return host;
}

export type SiteRead =
	| { kind: 'empty' }
	/** `completed`: a bare studio name was given the hosted domain. */
	| { kind: 'ok'; host: string; origin: string; completed: boolean }
	| { kind: 'problem'; reason: SiteProblem };

/** What the field holds: nothing, a site, or the reason it is not one. */
export function readSite(input: string): SiteRead {
	const tidy = tidySite(input);
	if (tidy === '') return { kind: 'empty' };
	const site = normalizeSite(tidy);
	if (!site.ok) return { kind: 'problem', reason: site.reason };
	const typed = input.replace(BLANK, '').toLowerCase();
	return { kind: 'ok', host: site.host, origin: site.origin, completed: !typed.includes('.') };
}
