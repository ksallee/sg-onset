// The Action Menu Item "Send set data to artists" (#106): Set Up Fields adds it on Shot and on Set
// Shot, for the project. A person runs it from Flow PT's web interface on the rows they select; it
// opens this app's page, which links the Set Shots and slates and writes the Notes on Shots from
// what Flow PT holds. One row per entity type and URL, found again by title and URL, never made
// twice: a second project is added to the row's projects. Pure: the calls are in setup.ts.
//
// From the corpus (findings/156_action_menu_item.md):
// - A row creates from `{}` at 201: `title`, `url`, `entity_type` and `projects` are ours to send.
//   Left alone, the item posts a form in a new tab (`payload_content_type` form, the checkboxes
//   off), which is what probe 156 recorded. Nothing else is sent.
// - `url` takes any string and is not checked: it is the deploy's own origin and the route, so a
//   deploy of a studio's own points at itself.
// - `entity_type` takes `Shot` and any `CustomEntityNN` slot, as a bare name, case-sensitive
//   (findings/field_types/entity_type.md).
// - Creating one is an Admin's call: an Artist gets 400 code 104 "cannot be created by this user".
// - `projects` is a multi-entity of Project rows, empty when not sent. What an empty list shows in
//   the web interface is not measured, so a row of ours always names its projects.

import type { Filter } from './api';
import { ACTION_PATH } from '$lib/send/request';

export const ACTION_MENU_ITEM = 'ActionMenuItem';
/** The fields read back. */
export const ACTION_FIELDS = ['title', 'url', 'entity_type', 'projects'];

/** The item's URL: the deploy's origin, where Flow PT posts. */
export function actionUrl(origin: string): string {
	return origin.replace(/\/+$/, '') + ACTION_PATH;
}

/** The search for our rows: the title and the URL, as text matches them. */
export function actionMenuFilter(title: string, url: string): Filter {
	return {
		logical_operator: 'and',
		conditions: [
			['title', 'is', title],
			['url', 'is', url]
		]
	};
}

export type ActionMenuRow = { id: number; title: string; url: string; entityType: string | null; projects: number[] };
type Row = { id: number; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: unknown } | undefined> };

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The rows of a search answer. */
export function actionMenuRowsOf(rows: readonly Row[]): ActionMenuRow[] {
	return rows.map((row) => {
		const data = row.relationships?.projects?.data;
		const projects = (Array.isArray(data) ? data : []).flatMap((l: { type?: unknown; id?: unknown }) => (l?.type === 'Project' && typeof l.id === 'number' ? [l.id] : []));
		const entityType = row.attributes?.entity_type;
		return { id: row.id, title: text(row.attributes?.title), url: text(row.attributes?.url), entityType: typeof entityType === 'string' ? entityType : null, projects };
	});
}

/**
 * - `present`: a row of ours on the entity type names the project.
 * - `addProject`: one is there for other projects: the project is added to it.
 * - `create`: none is there.
 */
export type ActionStep = { entityType: string } & ({ kind: 'present'; id: number } | { kind: 'addProject'; id: number } | { kind: 'create' });

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What each entity type needs. A row with the project wins, else the oldest row of ours. */
export function actionMenuPlan(input: { entityTypes: readonly string[]; projectId: number; title: string; url: string; rows: readonly ActionMenuRow[] }): ActionStep[] {
	return input.entityTypes.map((entityType): ActionStep => {
		const ours = input.rows.filter((r) => r.entityType === entityType && same(r.title, input.title) && same(r.url, input.url)).sort((a, b) => a.id - b.id);
		const holding = ours.find((r) => r.projects.includes(input.projectId));
		if (holding) return { entityType, kind: 'present', id: holding.id };
		if (ours.length) return { entityType, kind: 'addProject', id: ours[0].id };
		return { entityType, kind: 'create' };
	});
}

/** The `data` of a create. */
export function actionMenuData(entityType: string, projectId: number, title: string, url: string): Record<string, unknown> {
	return { title, url, entity_type: entityType, projects: [{ type: 'Project', id: projectId }] };
}

/** The `data` that adds the project to a row's projects, in place (recipes/009). */
export function addProjectData(projectId: number): Record<string, unknown> {
	return { projects: { multi_entity_update_mode: 'add', value: [{ type: 'Project', id: projectId }] } };
}
