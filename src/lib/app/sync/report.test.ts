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
	reverseFields: [],
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

	// Kevin, #117: a missing optional entity is a note, not something to fix before syncing.
	it('says an optional entity the site lacks is optional, and does not count it to fix', () => {
		const view = setupView(report({ entities: [{ scope: 'setShot', kind: 'custom', displayName: 'Set Shot', status: 'missing', optional: true }] }));
		expect(view.entities).toEqual([{ scope: 'setShot', displayName: 'Set Shot', action: 'enable', optional: true }]);
		expect(view.entitiesToFix).toBe(0);
		expect(view.notes).toBe(1);
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
	// corpus findings/142_reverse_field.md: each link field adds one on the type it links.
	it('lists the fields Flow PT adds for the links, by entity name, those to come first', () => {
		const view = setupView(
			report({
				reverseFields: [
					{ entityType: 'ShootDay', name: 'sg_slates', displayName: 'Slate <-> Shoot Day', source: 'Slate.sg_shoot_day', status: 'present' },
					{ entityType: 'Slate', name: 'sg_takes', displayName: 'Take <-> Slate', source: 'CustomEntity09.sg_slate', status: 'willAppear' },
					{ entityType: 'Attachment', name: 'custom_entity09_sg_photos_custom_entity09s', displayName: 'Takes <-> Photos', source: 'CustomEntity09.sg_photos', status: 'willAppear' }
				]
			})
		);
		expect(view.reverse).toEqual([
			{ entity: 'Slate', name: 'sg_takes', displayName: 'Take <-> Slate', status: 'willAppear' },
			{ entity: 'Attachment', name: 'custom_entity09_sg_photos_custom_entity09s', displayName: 'Takes <-> Photos', status: 'willAppear' },
			{ entity: 'Shoot Day', name: 'sg_slates', displayName: 'Slate <-> Shoot Day', status: 'present' }
		]);
		expect(view.reverseToCome).toBe(2);
	});
	it('passes on ready', () => {
		expect(setupView(report({ ready: true })).ready).toBe(true);
	});
});

// #106: the Action Menu Item "Send set data to artists", on Shot and on Set Shot.
describe('setupView: the Action Menu Item', () => {
	const URL_ = 'https://onset.example/action/send-set-data';
	const withAction = (items: NonNullable<SetupReport['action']>['items'], over: Partial<SetupReport> = {}) =>
		setupView(
			report({
				entities: [{ scope: 'setShot', kind: 'custom', displayName: 'Set Shot', status: 'found', entityType: 'CustomEntity22' }],
				action: { title: 'Send set data to artists', url: URL_, items },
				...over
			})
		);

	it('names each entity as the site shows it, with what happened', () => {
		const view = withAction([
			{ entityType: 'Shot', status: 'present' },
			{ entityType: 'CustomEntity22', status: 'failed', reason: 'Something else' }
		]);
		expect(view.action).toEqual({
			title: 'Send set data to artists',
			url: URL_,
			lines: [
				{ entity: 'Shot', entityType: 'Shot', status: 'present' },
				{ entity: 'Set Shot', entityType: 'CustomEntity22', status: 'failed', reason: 'Something else' }
			]
		});
		expect(view.actionToAdd).toBe(0);
	});

	it('offers Set Up Fields when it is missing, even with every field there', () => {
		const view = withAction([
			{ entityType: 'Shot', status: 'missing' },
			{ entityType: 'CustomEntity22', status: 'present' }
		]);
		expect(view.actionToAdd).toBe(1);
		expect(view.canSetUpFields).toBe(true);
		expect(withAction([{ entityType: 'Shot', status: 'missing' }], { canCreateFields: false }).canSetUpFields).toBe(false);
	});

	it('an account that may not add it is a permission problem', () => {
		expect(withAction([{ entityType: 'Shot', status: 'needsAdmin' }]).permission).toBe(true);
	});

	it('none without a project', () => {
		expect(setupView(report()).action).toBeUndefined();
		expect(setupView(report()).actionToAdd).toBe(0);
	});
});

