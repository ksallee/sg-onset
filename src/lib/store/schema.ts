// The IndexedDB schema, by version. Versions only ever get added: a shipped version is never
// edited, because iPads in the field hold data written under it.
//
// To change the schema: append `{ version: n + 1, stores, upgrade }`. `stores` lists only the
// tables whose keys or indexes change (Dexie carries the rest over; `null` drops a table).
// `upgrade` rewrites the rows already there, inside the upgrade transaction. A change of shape
// with no change of index still needs a new version, for its `upgrade`.

import type { Transaction } from 'dexie';
import { PARENTS, TABLES } from './tables';

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

function recordStores(): Record<string, string> {
	return Object.fromEntries(TABLES.map((table) => [table, PARENTS[table] ? `id, ${PARENTS[table].key}` : 'id']));
}

export const VERSIONS: readonly SchemaVersion[] = [
	{
		version: 1,
		stores: {
			...recordStores(),
			blobs: 'id, recordId',
			blobData: 'id',
			outbox: 'id, seq, op.recordId',
			remotes: 'id',
			trash: 'id',
			meta: 'key'
		}
	}
];

export const SCHEMA_VERSION = VERSIONS[VERSIONS.length - 1].version;
