// The IndexedDB schema, by version. Versions only ever get added: a shipped version is never
// edited, because iPads in the field hold data written under it.
//
// To change the schema: append `{ version: n + 1, stores, upgrade }`. `stores` lists only the
// tables whose keys or indexes change (Dexie carries the rest over; `null` drops a table).
// `upgrade` rewrites the rows already there, inside the upgrade transaction. A change of shape
// with no change of index still needs a new version, for its `upgrade`.

import type { Transaction } from 'dexie';
import { PARENTS, TABLES, type TableName } from './tables';

export type SchemaVersion = {
	version: number;
	/** Table name to Dexie index spec: the primary key, then the indexed keys. */
	stores: Record<string, string | null>;
	upgrade?: (tx: Transaction) => PromiseLike<unknown> | void;
};

/**
 * The store's own tables.
 * - `blobs`: one row per file, without the bytes, so listing files reads no photo.
 * - `blobData`: the bytes, `{ id, data: Blob }`.
 * - `outbox`: the sync queue. `seq` orders it; `op.recordId` finds a record's entries.
 * - `remotes`: client UUID to the server's id.
 * - `trash`: removed records, kept until the server confirms the delete.
 * - `meta`: counters.
 */
export const INTERNAL_TABLES = ['blobs', 'blobData', 'outbox', 'remotes', 'trash', 'meta'] as const;

/** A record table's spec: keyed by id, indexed by its parent key. */
function recordStores(tables: readonly TableName[]): Record<string, string> {
	return Object.fromEntries(tables.map((table) => [table, PARENTS[table] ? `id, ${PARENTS[table].key}` : 'id']));
}

/** The record tables of version 1, fixed: a table added later comes in its own version. */
const V1_TABLES = TABLES.filter((t) => t !== 'template');

export const VERSIONS: readonly SchemaVersion[] = [
	{
		version: 1,
		stores: {
			...recordStores(V1_TABLES),
			blobs: 'id, recordId',
			blobData: 'id',
			outbox: 'id, seq, op.recordId',
			remotes: 'id',
			trash: 'id',
			meta: 'key'
		}
	},
	// Templates, kept on the device (tables.ts LOCAL_TABLES).
	{ version: 2, stores: recordStores(['template']) }
];

export const SCHEMA_VERSION = VERSIONS[VERSIONS.length - 1].version;
