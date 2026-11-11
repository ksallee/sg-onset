import { describe, expect, it } from 'vitest';
import type { FieldReport, SetupReport } from '$lib/fpt';
import { setupView } from './report';

const SITE = 'https://studio.shotgrid.autodesk.com';

const field = (over: Partial<FieldReport>): FieldReport => ({
	scope: 'take',
	entityType: 'CustomEntity09',
	name: 'sg_t_stop',
	displayName: 'T Stop',
	dataType: 'float',
	status: 'present',
	...over
});

const report = (over: Partial<SetupReport> = {}): SetupReport => ({
	ready: false,
	site: SITE,
	entities: [
		{ scope: 'shootDay', kind: 'builtin', displayName: 'Shoot Day', status: 'found', entityType: 'ShootDay' },
		{ scope: 'slate', kind: 'builtin', displayName: 'Slate', status: 'missing', entityType: 'Slate' },
		{ scope: 'take', kind: 'custom', displayName: 'Take', status: 'found', entityType: 'CustomEntity09' },
		{ scope: 'lens', kind: 'custom', displayName: 'Lens', status: 'missing' },
		{ scope: 'cameraSetup', kind: 'custom', displayName: 'Camera Setup', status: 'ambiguous', candidates: ['CustomEntity10', 'CustomEntity12'] }
	],
	fields: [],
	...over
});

describe('setupView: entities', () => {
	it('says which are found, and for the rest exactly what an admin does', () => {
		const view = setupView(report());
		expect(view.entities).toEqual([
			{ scope: 'shootDay', displayName: 'Shoot Day', action: 'found', entityType: 'ShootDay' },
			{ scope: 'slate', displayName: 'Slate', action: 'switchOn', entityType: 'Slate' },
			{ scope: 'take', displayName: 'Take', action: 'found', entityType: 'CustomEntity09' },
			{ scope: 'lens', displayName: 'Lens', action: 'enable' },
			{ scope: 'cameraSetup', displayName: 'Camera Setup', action: 'keepOne', candidates: ['CustomEntity10', 'CustomEntity12'] }
		]);
		expect(view.entitiesToFix).toBe(3);
	});
});

describe('setupView: fields', () => {
	it('groups the fields by what happened, each with its entity by name', () => {
		const view = setupView(
			report({
				fields: [
					field({ name: 'sg_a', status: 'present' }),
					field({ name: 'sg_b', status: 'created' }),
					field({ name: 'sg_c', status: 'missing', scope: 'shootDay', entityType: 'ShootDay', displayName: 'Location', dataType: 'text' }),
					field({ name: 'sg_onset_uuid', status: 'needsAdmin', displayName: 'Onset UUID', dataType: 'text', unique: true, reason: 'Permission denied' }),
					field({ name: 'sg_lens', status: 'blocked', dataType: 'entity', reason: 'links Lens, which the site does not have yet' }),
					field({ name: 'sg_e', status: 'failed', reason: 'the site created sg_e_1' })
				]
			})
		);
		expect(view.counts).toEqual({ present: 1, created: 1, missing: 1, needsAdmin: 1, blocked: 1, failed: 1 });
		expect(view.fields.missing).toEqual([{ entity: 'Shoot Day', name: 'sg_c', displayName: 'Location', dataType: 'text' }]);
		expect(view.fields.needsAdmin).toEqual([{ entity: 'Take', name: 'sg_onset_uuid', displayName: 'Onset UUID', dataType: 'text', unique: true, reason: 'Permission denied' }]);
		expect(view.fields.blocked[0].reason).toBe('links Lens, which the site does not have yet');
		expect(view.fields.present.map((f) => f.name)).toEqual(['sg_a']);
		expect(view.fields.created.map((f) => f.name)).toEqual(['sg_b']);
		expect(view.fields.failed.map((f) => f.name)).toEqual(['sg_e']);
	});
	it('offers Set Up Fields only when fields are missing and creating was not refused', () => {
		const missing = [field({ status: 'missing' })];
		expect(setupView(report({ fields: missing })).canSetUpFields).toBe(true);
		expect(setupView(report({ fields: missing, canCreateFields: false })).canSetUpFields).toBe(false);
		expect(setupView(report({ fields: [field({})] })).canSetUpFields).toBe(false);
	});
	it('says when the person may not create fields', () => {
		expect(setupView(report({ canCreateFields: false, fields: [field({ status: 'needsAdmin' })] })).permission).toBe(true);
		expect(setupView(report({ fields: [field({ status: 'needsAdmin' })] })).permission).toBe(true);
		expect(setupView(report({ canCreateFields: true })).permission).toBe(false);
		expect(setupView(report()).permission).toBe(false);
	});
	it('passes on ready', () => {
		expect(setupView(report({ ready: true })).ready).toBe(true);
	});
});
