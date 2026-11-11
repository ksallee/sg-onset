/**
 * The Flow PT site a person types at sign-in, checked before this app's server
 * forwards anything to it.
 *
 * The server proxies the App Session Launcher, since `/internal_api` answers no
 * CORS header (corpus findings/062_cors.md). A proxy that takes a host from the
 * caller is an open relay unless the host is checked, so this module is strict:
 * https only, a plain DNS name, no port, no userinfo, no path, no IP, no local
 * name, no punycode and nothing outside ASCII. The input is read by hand rather
 * than handed to `new URL`, which quietly fixes what it should refuse: it drops
 * `:443`, strips tabs and newlines, maps a fullwidth dot to `.`, and turns
 * `0x7f.1` into `127.0.0.1`.
 *
 * Hosts allowed by default: Autodesk's hosted domains. The corpus holds no entry
 * that lists them; these two are the ones sg-notes and sg-task-templates
 * recognise (their site bars trim `.shotgrid.autodesk.com` and
 * `.shotgunstudio.com`). A deploy adds its own hosts with `FPT_EXTRA_HOSTS`.
 *
 * Pure: no I/O.
 */

/** Autodesk-hosted Flow PT. A wildcard matches exactly one label. */
export const DEFAULT_HOST_PATTERNS = ['*.shotgrid.autodesk.com', '*.shotgunstudio.com'] as const;

export type SiteProblem =
	| 'empty'
	| 'not-https'
	| 'port'
	| 'userinfo'
	| 'path'
	| 'ip'
	| 'local'
	| 'punycode'
	| 'not-ascii'
	| 'invalid'
	| 'not-allowed';

export type SiteCheck = { ok: true; host: string; origin: string } | { ok: false; reason: SiteProblem };

/** Schemes a person might paste that are never a site. */
const OTHER_SCHEMES = new Set(['http', 'https', 'ftp', 'ws', 'wss', 'file', 'javascript', 'data', 'blob', 'mailto', 'about', 'vbscript']);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** A last label the URL parser reads as an IPv4 part. */
const NUMERIC_LABEL = /^(?:0x[0-9a-f]*|[0-9]+)$/;
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.arpa'];

const fail = (reason: SiteProblem): SiteCheck => ({ ok: false, reason });

/** A lower-case host, checked as a public DNS name. */
function validateHost(host: string): SiteCheck {
	const labels = host.split('.');
	if (/^[0-9]+$/.test(host) || NUMERIC_LABEL.test(labels[labels.length - 1])) return fail('ip');
	if (host === 'localhost' || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return fail('local');
	if (host.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l))) return fail('invalid');
	if (labels.some((l) => l.startsWith('xn--'))) return fail('punycode');
	// What the browser and the server's fetch will resolve must be what was checked.
	try {
		if (new URL(`https://${host}/`).hostname !== host) return fail('invalid');
	} catch {
		return fail('invalid');
	}
	return { ok: true, host, origin: `https://${host}` };
}

/** The site's origin, `https://<host>`, from what a person typed. */
export function normalizeSite(input: string): SiteCheck {
	const typed = input.trim();
	if (typed === '') return fail('empty');
	if (/[^\x00-\x7f]/.test(typed)) return fail('not-ascii');
	if (/[^\x21-\x7e]/.test(typed)) return fail('invalid');

	let rest = typed;
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(typed);
	if (scheme) {
		const name = scheme[1].toLowerCase();
		const after = typed.slice(scheme[0].length);
		if (name === 'https' && after.startsWith('//')) rest = after.slice(2);
		else if (after.startsWith('//') || OTHER_SCHEMES.has(name)) return fail('not-https');
		// Otherwise `host:port`, which the authority check refuses below.
	} else if (typed.startsWith('//')) {
		return fail('not-https');
	}

	const end = rest.search(/[/?#\\]/);
	const authority = end === -1 ? rest : rest.slice(0, end);
	const tail = end === -1 ? '' : rest.slice(end);
	if (authority.includes('@')) return fail('userinfo');
	if (authority.startsWith('[')) return fail('ip');
	if (authority.includes(':')) return fail('port');
	if (tail !== '' && tail !== '/') return fail('path');
	return validateHost(authority.toLowerCase());
}

/**
 * The hosts a deploy adds, from `FPT_EXTRA_HOSTS`: exact hosts or `*.domain`,
 * separated by commas or spaces. An entry that would match an IP, a local name,
 * a bare TLD or more than one label per wildcard is refused, not widened.
 */
export function parseHostPatterns(raw: string | undefined): { patterns: string[]; rejected: string[] } {
	const patterns: string[] = [];
	const rejected: string[] = [];
	for (const entry of (raw ?? '').split(/[\s,]+/)) {
		if (entry === '') continue;
		const lower = entry.toLowerCase();
		const host = lower.startsWith('*.') ? lower.slice(2) : lower;
		if (/^[a-z0-9.-]+$/.test(host) && validateHost(host).ok) patterns.push(lower);
		else rejected.push(entry);
	}
	return { patterns, rejected };
}

/** Whether a checked host matches one of the patterns. */
export function hostAllowed(host: string, patterns: readonly string[]): boolean {
	return patterns.some((pattern) => {
		if (!pattern.startsWith('*.')) return host === pattern;
		const suffix = pattern.slice(1);
		return host.endsWith(suffix) && !host.slice(0, -suffix.length).includes('.') && host.length > suffix.length;
	});
}

/** The site, checked and on the allowlist: the defaults plus what the deploy adds. */
export function checkSite(input: string, extraHosts?: string): SiteCheck {
	const site = normalizeSite(input);
	if (!site.ok) return site;
	const patterns = [...DEFAULT_HOST_PATTERNS, ...parseHostPatterns(extraHosts).patterns];
	return hostAllowed(site.host, patterns) ? site : fail('not-allowed');
}
