import { describe, expect, it } from 'vitest';
import { FIELDS, SCOPES } from '$lib/model/catalogue';
import { dependsOn, isLocal, isTable, linkKeys, LOCAL_TABLES, PARENTS, TABLES } from './tables';

describe('TABLES', () => {
	it('has one table per scope, one for stills and one for templates', () => {
		expect(TABLES).toEqual([...SCOPES, 'still', 'template']);
		expect(isTable('take')).toBe(true);
		expect(isTable('template')).toBe(true);
		expect(isTable('outbox')).toBe(false);
	});
});

describe('LOCAL_TABLES', () => {
	it('are the tables kept on the device and never synced: templates', () => {
		expect(LOCAL_TABLES).toEqual(['template']);
		expect(isLocal('template')).toBe(true);
		expect(isLocal('take')).toBe(false);
	});

	it('keeps templates under the project', () => {
		expect(PARENTS.template).toEqual({ key: 'projectId', table: 'project' });
		expect(linkKeys('template')).toEqual([{ key: 'projectId', table: 'project' }]);
	});
});

describe('PARENTS', () => {
	it('names a parent table that exists, for every table but project', () => {
		for (const table of TABLES) {
			const parent = PARENTS[table];
			if (table === 'project') expect(parent).toBeUndefined();
			else expect(isTable(parent!.table)).toBe(true);
		}
	});

	it('never loops', () => {
		for (const table of TABLES) {
			let at = PARENTS[table];
			for (let depth = 0; at; depth++) {
				expect(depth).toBeLessThan(TABLES.length);
				at = PARENTS[at.table];
			}
		}
	});
});

describe('linkKeys', () => {
	it('lists the parent key, then every ref field of the catalogue', () => {
		expect(linkKeys('take')).toEqual([
			{ key: 'slateId', table: 'slate' },
			{ key: 'cameraSetupId', table: 'cameraSetup' },
			{ key: 'cameraId', table: 'camera' },
			{ key: 'lensId', table: 'lens' }
		]);
		expect(linkKeys('project')).toEqual([]);
		expect(linkKeys('still')).toEqual([{ key: 'takeId', table: 'take' }]);
	});

	it('covers every ref in the catalogue', () => {
		const refs = FIELDS.filter((f) => f.type === 'ref');
		expect(refs.length).toBeGreaterThan(0);
		for (const f of refs) expect(linkKeys(f.scope).map((l) => l.key)).toContain(f.key);
	});
});

describe('dependsOn', () => {
	it('is the ids a record links to, once each', () => {
		expect(dependsOn('take', { id: 't1', slateId: 's1', cameraId: 'c1', lensId: 'l1', take: '1' })).toEqual(['s1', 'c1', 'l1']);
		expect(dependsOn('cameraSetup', { projectId: 'p1', cameraId: 'c1', lensId: 'c1' })).toEqual(['p1', 'c1']);
	});

	it('works on the changed keys alone, and skips a cleared link', () => {
		expect(dependsOn('take', { lensId: 'l2', tStop: 4 })).toEqual(['l2']);
		expect(dependsOn('take', { lensId: undefined })).toEqual([]);
		expect(dependsOn('project', { name: 'Show' })).toEqual([]);
	});
});
