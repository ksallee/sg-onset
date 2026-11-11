import { describe, expect, it } from 'vitest';
import type { TableName } from '$lib/store/tables';
import { childTables, collectTree } from './tree';

describe('childTables', () => {
	it('follows the parent keys of the store', () => {
		expect(childTables('project').sort()).toEqual(['camera', 'cameraSetup', 'lens', 'lightingSetup', 'shootDay', 'template']);
		expect(childTables('shootDay')).toEqual(['slate']);
		expect(childTables('slate')).toEqual(['take']);
		expect(childTables('take')).toEqual(['still']);
		expect(childTables('still')).toEqual([]);
	});
});

describe('collectTree', () => {
	const rows: Record<string, Record<string, string[]>> = {
		slate: { d1: ['s1', 's2'] },
		take: { s1: ['t1', 't2'], s2: [] },
		still: { t1: ['p1'] }
	};
	const list = async (table: TableName, parentId: string) => (rows[table]?.[parentId] ?? []).map((id) => ({ id }));

	it('gives a record alone when nothing is under it', async () => {
		expect(await collectTree(list, 'take', 't2')).toEqual([{ table: 'take', id: 't2' }]);
	});
	it('gives the descendants first and the record last', async () => {
		expect(await collectTree(list, 'shootDay', 'd1')).toEqual([
			{ table: 'still', id: 'p1' },
			{ table: 'take', id: 't1' },
			{ table: 'take', id: 't2' },
			{ table: 'slate', id: 's1' },
			{ table: 'slate', id: 's2' },
			{ table: 'shootDay', id: 'd1' }
		]);
	});
});
