// Records, both ways: one of ours to the `data` of a Flow Production Tracking create or update,
// and a row the server answers back to our keys. Pure.
//
// A create inside a batch skips the validation a single create applies: a row with no project is
// made and can never be read again (corpus recipes/002_batch.md). So everything is checked here,
// and what cannot be sent is refused with the reason rather than sent in hope.

import type { FieldEdit, RemoteId } from '$lib/outbox/types';
import { readValue, writeValue } from './convert';
import { CREATED_AT, fieldMap, UUID, type Column, type EntityScope, type FieldMap, type Target } from './mapping';
import { fieldName, type Resolution } from './schema';

export type Built = { ok: true; data: Record<string, unknown> } | { ok: false; message: string };

/** A row as `_search` and `_batch` answer it (corpus endpoints/post_entity_type_search.md). */
export type Row = {
	type: string;
	id: number;
	attributes?: Record<string, unknown>;
	relationships?: Record<string, { data?: unknown } | undefined>;
};

type EntityRef = { type: string; id: number };

export function typeOf(resolution: Resolution, target: Target): string {
	if (target === 'project') return 'Project';
	if (target === 'attachment') return 'Attachment';
	return resolution.entities[target];
}

/** The name on the site of the client UUID field of a scope. */
export function uuidField(resolution: Resolution, scope: EntityScope): string {
	return fieldName(resolution, scope, UUID);
}

class Refused extends Error {}

/** The link a key holds, as the `{type, id}` hash an entity field takes (field_types/entity.md). */
function linkOf(resolution: Resolution, map: FieldMap, value: unknown, links: Record<string, RemoteId>, projectId: number): EntityRef | null {
	if (value === undefined || value === null || value === '') return null;
	const target = map.columns[0].target!;
	const id = typeof value === 'string' ? links[value] : undefined;
	if (typeof id !== 'number') throw new Refused(`${map.scope}.${map.key}: the linked record ${String(value)} is not on the server yet`);
	// A record is written into the project the transport syncs with, and no other.
	if (target === 'project' && id !== projectId) throw new Refused(`${map.scope}.${map.key}: the record belongs to another project`);
	return { type: typeOf(resolution, target), id };
}

function put(resolution: Resolution, data: Record<string, unknown>, map: FieldMap, value: unknown, links: Record<string, RemoteId>, projectId: number, clear: boolean): void {
	const name = (column: Column) => fieldName(resolution, map.scope, column);
	if (map.kind === 'ref') {
		const link = linkOf(resolution, map, value, links, projectId);
		if (link || clear) data[name(map.columns[0])] = link;
		return;
	}
	if (value === undefined && !clear) return;
	const written = writeValue(map, value);
	if (!Array.isArray(written)) throw new Refused(written.error);
	map.columns.forEach((column, i) => (data[name(column)] = written[i]));
	if (map.alsoCode) data.code = written[0];
}

function known(scope: EntityScope, key: string): FieldMap {
	const map = fieldMap(scope, key);
	// A key with no field would be dropped in silence. Refuse it instead.
	if (!map) throw new Refused(`${scope}.${key} has no field in Flow Production Tracking`);
	return map;
}

function build(make: () => Record<string, unknown>): Built {
	try {
		return { ok: true, data: make() };
	} catch (error) {
		if (error instanceof Refused) return { ok: false, message: error.message };
		throw error;
	}
}

/**
 * The `data` of a create. Always holds the project and the client UUID. A missing value is left
 * out, never sent as null: `created_at: null` leaves a row undated (corpus
 * findings/070_authored_timestamps.md), and a checkbox refuses null.
 */
export function createData(
	resolution: Resolution,
	scope: EntityScope,
	recordId: string,
	fields: Record<string, unknown>,
	links: Record<string, RemoteId>,
	projectId: number
): Built {
	return build(() => {
		const data: Record<string, unknown> = { project: { type: 'Project', id: projectId }, [uuidField(resolution, scope)]: recordId };
		const stamp = CREATED_AT[scope];
		if (stamp && fields[stamp] !== undefined) {
			// `created_at` is stored as sent on a create, and refused on an update (findings/070).
			const written = writeValue(known(scope, stamp), fields[stamp]);
			if (!Array.isArray(written)) throw new Refused(written.error);
			data.created_at = written[0];
		}
		for (const [key, value] of Object.entries(fields)) put(resolution, data, known(scope, key), value, links, projectId, false);
		return data;
	});
}

/** The `data` of an update: only the fields that changed. A missing value clears the field. */
export function updateData(
	resolution: Resolution,
	scope: EntityScope,
	changes: Record<string, FieldEdit>,
	links: Record<string, RemoteId>,
	projectId: number
): Built {
	return build(() => {
		const data: Record<string, unknown> = {};
		for (const [key, edit] of Object.entries(changes)) put(resolution, data, known(scope, key), edit.value, links, projectId, true);
		return data;
	});
}

/**
 * The path that reads the client UUID of a linked record through its link, in the same search
 * as the record: no second request (field_types/entity.md). A dotted path reaches an `sg_` field
 * of a custom entity through an `sg_` entity field, written with the schema name
 * (`sg_slate.Slate.sg_onset_uuid`, `sg_lens.CustomEntity19.sg_onset_uuid`), in projection and
 * filter alike (corpus findings/138_dotted_custom_field.md).
 */
function uuidPath(resolution: Resolution, scope: EntityScope, column: Column): string | undefined {
	const target = column.target;
	if (!target || target === 'project' || target === 'attachment') return undefined;
	return `${fieldName(resolution, scope, column)}.${resolution.entities[target]}.${uuidField(resolution, target)}`;
}

/** The fields to ask the server for, to read these keys. An unknown key asks for nothing. */
export function readFields(resolution: Resolution, scope: EntityScope, keys: readonly string[]): string[] {
	const out: string[] = [];
	for (const key of keys) {
		const map = fieldMap(scope, key);
		if (!map) continue;
		for (const column of map.columns) out.push(fieldName(resolution, scope, column));
		if (map.kind === 'ref') {
			const path = uuidPath(resolution, scope, map.columns[0]);
			if (path) out.push(path);
		}
	}
	return [...new Set(out)];
}

/**
 * A row's values of these keys, in our form. A missing value is an absent key. A link comes back
 * as the client UUID of the linked record; a link to a record with none is not one of ours and
 * comes back as `fpt:<Type>:<id>`, which equals no id of ours.
 */
export function fromRow(resolution: Resolution, scope: EntityScope, row: Row, keys: readonly string[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const attributes = row.attributes ?? {};
	for (const key of keys) {
		const map = fieldMap(scope, key);
		if (!map) continue;
		let value: unknown;
		if (map.kind === 'ref') {
			// A link is under `relationships`, never `attributes` (field_types/entity.md).
			const link = row.relationships?.[fieldName(resolution, scope, map.columns[0])]?.data as EntityRef | null | undefined;
			if (link && typeof link === 'object') {
				const path = uuidPath(resolution, scope, map.columns[0]);
				const uuid = path ? attributes[path] : undefined;
				value = typeof uuid === 'string' && uuid ? uuid : `fpt:${link.type}:${link.id}`;
			}
		} else {
			value = readValue(
				map,
				map.columns.map((column) => attributes[fieldName(resolution, scope, column)])
			);
		}
		if (value !== undefined) out[key] = value;
	}
	return out;
}
