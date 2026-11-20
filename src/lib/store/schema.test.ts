import { describe, expect, it } from 'vitest';
import { INTERNAL_TABLES, SCHEMA_VERSION, SNAPSHOT_TABLES, SNAPSHOTS_SINCE, VERSIONS } from './schema';
import { PARENTS, TABLES } from './tables';

describe('VERSIONS', () => {
	it('starts at 1 and rises by one', () => {
		expect(VERSIONS.map((v) => v.version)).toEqual(VERSIONS.map((_, i) => i + 1));
		expect(SCHEMA_VERSION).toBe(VERSIONS.length);
	});

	it('has a table per record table, keyed by id and indexed by parent', () => {
		const stores = Object.assign({}, ...VERSIONS.map((v) => v.stores));
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
		const later = ['template', 'reference', 'referenceKind', 'markup', 'diagram', 'clipImport'];
		expect(Object.keys(stores).sort()).toEqual([...TABLES.filter((t) => !later.includes(t)), ...INTERNAL_TABLES].sort());
	});

	it('adds the template table in version 3, and nothing else', () => {
		expect(VERSIONS[2]).toEqual({ version: 3, stores: { template: 'id, projectId' } });
	});

	it('adds the set references and the project kinds in version 4, and nothing else', () => {
		expect(VERSIONS[3]).toEqual({ version: 4, stores: { reference: 'id, slateId', referenceKind: 'id, projectId' } });
	});

	it('adds the markup table, the drawings on photos, in version 5, and nothing else', () => {
		expect(VERSIONS[4]).toEqual({ version: 5, stores: { markup: 'id, stillId' } });
	});

	it('adds the diagram table, the setup diagrams, in version 6, and nothing else', () => {
		expect(VERSIONS[5]).toEqual({ version: 6, stores: { diagram: 'id, slateId' } });
	});

	it('adds the clip imports in version 7, and nothing else', () => {
		expect(VERSIONS[6]).toEqual({ version: 7, stores: { clipImport: 'id, shootDayId' } });
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
