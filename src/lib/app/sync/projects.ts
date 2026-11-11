// The FPT projects a person can link to. Pure: the call is `listProjects` in engine.ts.

import type { EntityRow } from 'sg-widgets-core';

export interface ProjectChoice {
	id: number;
	name: string;
}

/**
 * The projects a person would pick from. corpus findings/018_project_listing.md: `sg_status` is
 * null on most working shows and is no liveness flag; `is_template`, `is_demo` and `archived` are
 * the discriminators. Through `POST /entity/projects/_search` (endpoints/post_entity_type_search.md),
 * which returns only what the person may see.
 */
export const PROJECT_FILTER = {
	logical_operator: 'and' as const,
	conditions: [
		['is_template', 'is', false] as [string, string, unknown],
		['is_demo', 'is', false] as [string, string, unknown],
		['archived', 'is', false] as [string, string, unknown]
	]
};

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** The rows of the search, by name, then id. A project with no name shows its id. */
export function projectChoices(rows: readonly Pick<EntityRow, 'id' | 'attributes'>[]): ProjectChoice[] {
	return rows
		.map((r) => {
			const name = typeof r.attributes.name === 'string' ? r.attributes.name.trim() : '';
			return { id: r.id, name: name || String(r.id) };
		})
		.sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id);
}
