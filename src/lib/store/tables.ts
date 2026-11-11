// The tables of the store, from the model: one per scope, one for stills and one for templates.
// Which key holds the parent, which keys link to other records, which tables stay on the device.
// Pure.

import { FIELDS, SCOPES, type Scope } from '$lib/model/catalogue';
import type { TemplateRecord } from '$lib/model/template';
import type { RecordOf, Still } from '$lib/model/types';

export const TABLES = [...SCOPES, 'still', 'template'] as const;
export type TableName = (typeof TABLES)[number];

export type RowOf<T extends TableName> = T extends Scope ? RecordOf<T> : T extends 'template' ? TemplateRecord : Still;

export function isTable(name: string): name is TableName {
	return (TABLES as readonly string[]).includes(name);
}

/**
 * The tables kept on the device and never synced: nothing is queued for them. Flow PT has no
 * place for a template; a slate or take keeps the id of its template as text.
 */
export const LOCAL_TABLES = ['template'] as const satisfies readonly TableName[];

export function isLocal(name: string): boolean {
	return (LOCAL_TABLES as readonly string[]).includes(name);
}

type Link = { key: string; table: TableName };

/** The key that holds a record's parent. A project has none. */
export const PARENTS: Record<TableName, Link | undefined> = {
	project: undefined,
	shootDay: { key: 'projectId', table: 'project' },
	lightingSetup: { key: 'projectId', table: 'project' },
	cameraSetup: { key: 'projectId', table: 'project' },
	camera: { key: 'projectId', table: 'project' },
	lens: { key: 'projectId', table: 'project' },
	slate: { key: 'shootDayId', table: 'shootDay' },
	take: { key: 'slateId', table: 'slate' },
	still: { key: 'takeId', table: 'take' },
	template: { key: 'projectId', table: 'project' }
};

/** Every key of `table` that holds the id of another record: the parent, then the catalogue's refs. */
export function linkKeys(table: TableName): Link[] {
	const parent = PARENTS[table];
	const refs = FIELDS.filter((f) => f.scope === table && f.type === 'ref').map((f) => ({
		key: f.key,
		table: (f as { ref: TableName }).ref
	}));
	return [...(parent ? [parent] : []), ...refs];
}

/**
 * The ids of the records `values` links to: what the server must have before these values can be
 * sent. `values` is a whole record, or only the keys that changed.
 */
export function dependsOn(table: TableName, values: Record<string, unknown>): string[] {
	const ids = linkKeys(table)
		.map((link) => values[link.key])
		.filter((id): id is string => typeof id === 'string' && id !== '');
	return [...new Set(ids)];
}
