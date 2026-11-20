// What Flow PT sends when a person runs "Send set data to artists" (#106), and the app page it is
// handed to. The route reads the form and answers 303 to the page with four values only; the page
// reads them back and checks them again, since its address can be typed. Pure.
//
// From the corpus (findings/156_action_menu_item.md, probe 156, Chrome, signed in):
// - The browser opens a new tab and posts `application/x-www-form-urlencoded`, even when the item
//   is set to json. `Origin: null`, `Sec-Fetch-Site: cross-site`, no `Referer`, no credential.
// - The fields: `selected_ids` (comma-separated), `ids` (every row on the page, 87 in the probe),
//   `entity_type`, `project_id`, `project_name`, `server_hostname`, `user_id`, `user_login`,
//   `session_uuid`, the page's columns and sort.
// We keep `selected_ids`, `entity_type`, `project_id` and `server_hostname`. The person's login,
// id and session never reach the page address, nor anything else of the form. Only the selected
// rows are acted on: `ids` is the whole page.
//
// Nothing in the request proves it came from Flow PT: no signature was measured (`secret_token`
// is a field of the item, what it adds to the request is not measured). So the request writes
// nothing by itself: the page shows what it will do and the person taps Send, signed in to that
// site with their own session.

import { checkSite, normalizeSite, type HostSettings } from '$lib/auth/site';

/** Where Flow PT posts: the Action Menu Item's URL is the deploy's origin and this. */
export const ACTION_PATH = '/action/send-set-data';
/** The app page the route hands the request to. */
export const PAGE_PATH = '/send-set-data';
/** The most rows one run takes. Each Shot is a few requests; the page address carries every id. */
export const MAX_ROWS = 500;

/** A run of the action: the site, the Flow PT project, the entity type of the rows, their ids. */
export type SendRequest = {
	/** The site's origin, `https://<host>`. */
	site: string;
	host: string;
	projectId: number;
	/** `Shot`, or the custom entity slot of Set Shot, `CustomEntityNN`. */
	entityType: string;
	/** The selected rows, each once, ascending. */
	ids: number[];
};

/**
 * - `bad-request`: a field is missing, sent twice, or not what Flow PT sends.
 * - `not-allowed`: the site is not on this deploy's list (`FPT_HOSTS`, `FPT_EXTRA_HOSTS`).
 * - `none-selected`: no row was selected.
 * - `too-many`: more than `MAX_ROWS` rows.
 */
export type RequestProblem = 'bad-request' | 'not-allowed' | 'none-selected' | 'too-many';
const PROBLEMS: readonly RequestProblem[] = ['bad-request', 'not-allowed', 'none-selected', 'too-many'];

export type ReadRequest = { ok: true; request: SendRequest } | { ok: false; problem: RequestProblem };

/** A positive integer as Flow PT writes an id: digits, no leading zero, ten at most. */
const ID = /^[1-9]\d{0,9}$/;
/** Shot, or a project custom entity slot: the only slot form Set Shot can have (findings/field_types/entity_type.md). */
const ENTITY_TYPE = /^(?:Shot|CustomEntity\d{2})$/;

const fail = (problem: RequestProblem): ReadRequest => ({ ok: false, problem });

/** The one value of a field, or undefined when it is missing or sent more than once. */
function one(form: URLSearchParams, name: string): string | undefined {
	const all = form.getAll(name);
	return all.length === 1 ? all[0] : undefined;
}

/** The ids of a comma-separated list, or the problem. Empty entries around are ignored; one between two ids is not. */
function readIds(raw: string | undefined): number[] | RequestProblem {
	const parts = (raw ?? '').split(',').map((p) => p.trim());
	if (parts.every((p) => p === '')) return 'none-selected';
	if (!parts.every((p) => ID.test(p))) return 'bad-request';
	const ids = [...new Set(parts.map(Number))].sort((a, b) => a - b);
	return ids.length > MAX_ROWS ? 'too-many' : ids;
}

function readRest(projectRaw: string | undefined, typeRaw: string | undefined, idsRaw: string | undefined): { projectId: number; entityType: string; ids: number[] } | RequestProblem {
	if (projectRaw === undefined || !ID.test(projectRaw)) return 'bad-request';
	if (typeRaw === undefined || !ENTITY_TYPE.test(typeRaw)) return 'bad-request';
	const ids = readIds(idsRaw);
	if (typeof ids === 'string') return ids;
	return { projectId: Number(projectRaw), entityType: typeRaw, ids };
}

/** The request out of the form Flow PT posts, checked. The site must pass the sign-in allowlist. */
export function readActionForm(form: URLSearchParams, settings: HostSettings): ReadRequest {
	const host = one(form, 'server_hostname');
	if (host === undefined) return fail('bad-request');
	const site = checkSite(host, settings);
	if (!site.ok) return fail(site.reason === 'not-allowed' ? 'not-allowed' : 'bad-request');
	// A bare host only: what Flow PT sends. `checkSite` takes `https://host/` too, as typed at sign-in.
	if (host !== site.host) return fail('bad-request');
	if (form.getAll('selected_ids').length > 1) return fail('bad-request');
	const rest = readRest(one(form, 'project_id'), one(form, 'entity_type'), form.get('selected_ids') ?? '');
	if (typeof rest === 'string') return fail(rest);
	return { ok: true, request: { site: site.origin, host: site.host, ...rest } };
}

/** The page's address for a request: the four values, nothing else. */
export function pagePath(request: SendRequest): string {
	const params = new URLSearchParams({ site: request.host, project: String(request.projectId), type: request.entityType, ids: request.ids.join(',') });
	return `${PAGE_PATH}?${params}`;
}

/** The page's address for a request that could not be read. */
export function problemPath(problem: RequestProblem): string {
	return `${PAGE_PATH}?${new URLSearchParams({ problem })}`;
}

export type PageRequest = { kind: 'request'; request: SendRequest } | { kind: 'problem'; problem: RequestProblem } | { kind: 'none' };

/**
 * What the page was given. The address can be typed, so it is checked again: the site's form (the
 * allowlist is the sign-in's: the person signs in to that site before anything is read), the
 * project, the type and the ids.
 */
export function readPage(params: URLSearchParams): PageRequest {
	const problem = params.get('problem');
	if (problem !== null) return { kind: 'problem', problem: PROBLEMS.includes(problem as RequestProblem) ? (problem as RequestProblem) : 'bad-request' };
	const host = params.get('site');
	if (host === null && !params.has('project') && !params.has('type') && !params.has('ids')) return { kind: 'none' };
	const site = normalizeSite(host ?? '');
	if (!site.ok || site.host !== host) return { kind: 'problem', problem: 'bad-request' };
	const rest = readRest(params.get('project') ?? undefined, params.get('type') ?? undefined, params.get('ids') ?? '');
	if (typeof rest === 'string') return { kind: 'problem', problem: rest };
	return { kind: 'request', request: { site: site.origin, host: site.host, ...rest } };
}
