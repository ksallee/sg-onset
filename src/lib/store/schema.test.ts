import { describe, expect, it } from 'vitest';
import { INTERNAL_TABLES, SCHEMA_VERSION, SNAPSHOT_TABLES, SNAPSHOTS_SINCE, VERSIONS } from './schema';
import { PARENTS, TABLES } from './tables';

describe('VERSIONS', () => {
	it('starts at 1 and rises by one', () => {
		expect(VERSIONS.map((v) => v.version)).toEqual(VERSIONS.map((_, i) => i + 1));
		expect(SCHEMA_VERSION).toBe(VERSIONS.length);
	});

	it('has a table per record table, keyed by id and indexed by parent', () => {
		const stores = VERSIONS[0].stores;
		for (const table of TABLES) {
			const parent = PARENTS[table];
			expect(stores[table]).toBe(parent ? `id, ${parent.key}` : 'id');
		}
	});

	it('has the store’s own tables, apart from the record tables', () => {
		const stores = VERSIONS[0].stores;
		for (const name of INTERNAL_TABLES) {
			expect(stores[name]).toBeTypeOf('string');
			expect((TABLES as readonly string[]).includes(name)).toBe(false);
		}
		expect(Object.keys(stores).sort()).toEqual([...TABLES, ...INTERNAL_TABLES].sort());
	});

	it('adds the snapshot tables in their own version, and nothing else', () => {
		const added = VERSIONS.find((v) => v.version === SNAPSHOTS_SINCE)!;
		expect(added.stores).toEqual({ snapshots: 'id, at, *blobIds', snapshotData: 'id' });
		expect([...SNAPSHOT_TABLES]).toEqual(['snapshots', 'snapshotData']);
		for (const name of SNAPSHOT_TABLES) expect((INTERNAL_TABLES as readonly string[]).includes(name)).toBe(false);
	});

	it('keeps the bytes of a file apart from its description', () => {
		expect(VERSIONS[0].stores.blobData).toBe('id');
		expect(VERSIONS[0].stores.blobs).toBe('id, recordId');
	});
});
