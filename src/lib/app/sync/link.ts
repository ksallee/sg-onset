// The link between an sg-onset project and the FPT project it syncs to. One sg-onset project, one
// FPT project, on one site. Kept on the device per project (links.ts), beside the site's schema,
// not in the store's tables: a backup carries records, never which site they sync to. Pure.

import type { RemoteId } from '$lib/outbox/types';

export interface ProjectLink {
	/** The site's origin, `https://<host>`. */
	site: string;
	/** The FPT project's id. */
	projectId: number;
	/** Its name when it was linked: for the eye only. */
	name: string;
}

const VERSION = 1;

/** The key a project's link is kept under. */
export function linkKey(localProjectId: string): string {
	return `link:${localProjectId}`;
}

export function serializeLink(link: ProjectLink): string {
	return JSON.stringify({ v: VERSION, ...link });
}

/** What was kept. Anything unreadable is no link. */
export function parseLink(raw: string | undefined): ProjectLink | undefined {
	if (!raw) return undefined;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (value === null || typeof value !== 'object') return undefined;
	const { v, site, projectId, name } = value as Record<string, unknown>;
	if (v !== VERSION || typeof site !== 'string' || !/^https:\/\/[^/]+$/.test(site)) return undefined;
	if (typeof projectId !== 'number' || !Number.isInteger(projectId) || projectId <= 0) return undefined;
	return { site, projectId, name: typeof name === 'string' ? name : '' };
}

/** The link, if it was made on the site signed in to. A link to another site does not hold. */
export function linkOn(link: ProjectLink | undefined, site: string | null): ProjectLink | undefined {
	return link && site && link.site === site ? link : undefined;
}

/**
 * Why the project cannot link to `chosen`, if it cannot. `synced` is the server id the project
 * already has: the transport answers the linked FPT project's id for the project's create
 * (lib/fpt README, decision 1). Once that is kept, the project's records are in that FPT project,
 * and linking another would send the rest elsewhere.
 */
export function linkProblem(synced: RemoteId | undefined, chosen: number): 'otherProject' | undefined {
	return synced !== undefined && synced !== chosen ? 'otherProject' : undefined;
}
