// Where the project links are kept: a key-value port (in the app, `localStorage`). See link.ts.

import type { KeyValue } from '$lib/fpt/cache';
import { linkKey, parseLink, serializeLink, type ProjectLink } from './link';

export interface LinkStore {
	get(localProjectId: string): Promise<ProjectLink | undefined>;
	set(localProjectId: string, link: ProjectLink): Promise<void>;
	remove(localProjectId: string): Promise<void>;
}

export function linkStore(kv: KeyValue): LinkStore {
	return {
		get: async (id) => parseLink(await kv.get(linkKey(id))),
		set: (id, link) => kv.set(linkKey(id), serializeLink(link)),
		remove: (id) => kv.delete(linkKey(id))
	};
}
