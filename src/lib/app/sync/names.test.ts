import { describe, expect, it } from 'vitest';
import type { NamesReview } from '$lib/fpt/setup';
import { completeFields, noteFields, projectFields, rawField, siteTypes, TYPES, versionFields } from '$lib/fpt/testkit';
import type { EntityScope } from '$lib/fpt/mapping';
import type { Naming } from '$lib/fpt/naming';
import { changeLines, draftReport, editableFields, importNames, namesFileName, namesView, problemLines } from './names';

/** The review of a site with every field of ours, a Location slot, and a float of the site's own on Take. */
function review(extra: Partial<NamesReview> = {}): NamesReview {
	const fields = completeFields();
	fields.take.sg_lens_mm = rawField('float', 'Lens mm');
	return {
		site: {
			types: { ...siteTypes(), CustomEntity30: { name: { value: 'Shot Take' } } },
			fields: {
				...Object.fromEntries(Object.entries(TYPES).map(([scope, type]) => [type, fields[scope as EntityScope]])),
				CustomEntity29: { code: rawField('text', 'Name') },
				CustomEntity30: { code: rawField('text', 'Name') },
				Version: versionFields(true),
				Note: noteFields(true),
				Project: projectFields(true),
				Attachment: {},
				Shot: {}
			}
		},
		named: { saved: 'none', naming: {} },
		synced: false,
		...extra
	};
}
const row = (view: ReturnType<typeof namesView>, key: string) => view.groups.flatMap((g) => g.fields).find((f) => f.key === key)!;
const entity = (view: ReturnType<typeof namesView>, scope: string) => view.entities.find((e) => e.scope === scope)!;

describe('namesView', () => {
	it('lists each custom entity and every field the app wants, under the names on the page', () => {
		const view = namesView(review(), {});
		expect(view.entities.map((e) => e.scope)).toEqual(['take', 'lens', 'cameraSetup', 'lightingSetup', 'reference', 'setShot']);
		expect(entity(view, 'take')).toMatchObject({ defaultName: 'Take', name: 'Take', status: 'found', entityType: 'CustomEntity09', locked: false, changed: false, optional: false });
		expect(entity(view, 'setShot')).toMatchObject({ optional: true });
		expect(view.groups.map((g) => g.entity)).toEqual(['Shoot Day', 'Lighting Setup', 'Camera Setup', 'Slate', 'Take', 'Camera', 'Lens', 'Set Reference', 'Set Shot', 'Version', 'Note', 'Project']);
		expect(row(view, 'take.sg_focal_length')).toMatchObject({ choice: 'keep', display: 'Focal Length', name: 'sg_focal_length', shown: 'Focal Length', status: 'present', locked: false, changed: false });
		// The site's own float is offered for a float field, and ours that other fields ask for are not.
		expect(row(view, 'take.sg_focal_length').options.map((o) => o.name)).toContain('sg_lens_mm');
		expect(row(view, 'take.sg_focal_length').options.map((o) => o.name)).not.toContain('sg_t_stop');
		// Its own field is Keep, not a field to pick.
		expect(row(view, 'take.sg_focal_length').options.map((o) => o.name)).not.toContain('sg_focal_length');
		expect(view).toMatchObject({ changes: 0, problems: [], ready: true, canReview: false, readOnly: false, synced: false });
		expect(view.siteEntities).toEqual(['Camera Setup', 'Lens', 'Lighting Setup', 'Location', 'Set Reference', 'Set Shot', 'Shot Take', 'Take']);
	});

	it('shows what a draft changes: a renamed field to create, a field of the site, another entity', () => {
		const draft: Naming = { entities: { take: 'Shot Take' }, fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' }, 'lens.sg_lens_make': { field: 'sg_lens_serial_number' } } };
		const view = namesView(review(), draft);
		expect(entity(view, 'take')).toMatchObject({ name: 'Shot Take', status: 'found', entityType: 'CustomEntity30', changed: true });
		expect(row(view, 'take.sg_t_stop')).toMatchObject({ choice: 'rename', display: 'Studio T-Stop', name: 'sg_studio_t_stop', status: 'create', changed: true });
		expect(view.changes).toBe(3);
		expect(view.ready).toBe(false);
		expect(view.canReview).toBe(false);
		// Two lens fields on one field: a problem, said in words.
		expect(view.problems).toEqual([{ kind: 'fields', place: 'lens', keys: ['lens.sg_lens_make', 'lens.sg_lens_serial_number'], name: 'sg_lens_serial_number' }]);
		expect(problemLines(view)).toEqual(['Lens: two fields would use sg_lens_serial_number.']);
	});

	it('offers a review of a draft with changes and no problem', () => {
		const view = namesView(review(), { fields: { 'take.sg_focal_length': { field: 'sg_lens_mm' } } });
		expect(row(view, 'take.sg_focal_length')).toMatchObject({ choice: 'field', field: 'sg_lens_mm', name: 'sg_lens_mm', shown: 'Lens mm', status: 'present' });
		expect(view).toMatchObject({ changes: 1, problems: [], ready: true, canReview: true });
	});

	it('keeps what is in use once the project has synced: found entities, fields there', () => {
		const site = review({ synced: true });
		delete site.site.fields.CustomEntity09.sg_tilt;
		delete site.site.types.CustomEntity22;
		const view = namesView(site, {});
		expect(view.synced).toBe(true);
		expect(entity(view, 'take')).toMatchObject({ locked: true });
		// Set Shot is not enabled: its name may change, and so may a field not found yet.
		expect(entity(view, 'setShot')).toMatchObject({ locked: false, status: 'missing' });
		expect(row(view, 'take.sg_focal_length').locked).toBe(true);
		expect(row(view, 'take.sg_tilt')).toMatchObject({ locked: false, status: 'create' });
		expect(editableFields(view).map((f) => f.column.name)).toContain('sg_tilt');
		expect(editableFields(view).map((f) => f.column.name)).not.toContain('sg_focal_length');
	});

	it('is read only for an account that may not save, and for names of a later version', () => {
		expect(namesView(review({ canSave: false }), { fields: { 'take.sg_focal_length': { field: 'sg_lens_mm' } } })).toMatchObject({ readOnly: true, canReview: false });
		expect(namesView(review({ named: { saved: 'unreadable', naming: {} } }), {})).toMatchObject({ readOnly: true, unreadable: true });
	});

	it('lists the fields of an entity the site lacks, waiting for it', () => {
		const site = review();
		delete site.site.types.CustomEntity22;
		expect(row(namesView(site, {}), 'setShot.sg_onset_key')).toMatchObject({ status: 'waiting', options: [] });
	});
});

describe('importNames', () => {
	it('takes the names of a file, and keeps the names in use once the project has synced', () => {
		const site = review({ synced: true, named: { saved: 'saved', naming: { fields: { 'take.sg_tilt': { display: 'Tilt Deg' } } } } });
		site.site.fields.CustomEntity09.sg_tilt_deg = rawField('float', 'Tilt Deg');
		delete site.site.types.CustomEntity22;
		const file: Naming = { entities: { take: 'Shot Take', setShot: 'Shot Code' }, fields: { 'take.sg_tilt': { display: 'Other Tilt' }, 'setShot.sg_onset_key': { display: 'Code Key' } } };
		const view = namesView(site, site.named.naming);
		const { naming, kept } = importNames(view, site.named.naming, file);
		expect(naming).toEqual({ entities: { setShot: 'Shot Code' }, fields: { 'take.sg_tilt': { display: 'Tilt Deg' }, 'setShot.sg_onset_key': { display: 'Code Key' } } });
		expect(kept).toBe(2);
		// Not synced: the file is taken whole.
		expect(importNames(namesView(review(), {}), {}, file)).toEqual({ naming: file, kept: 0 });
	});
});

describe('changeLines and namesFileName', () => {
	it('lists what a draft changes, entities first, each with its new name', () => {
		const view = namesView(review(), { entities: { setShot: 'Shot Code' }, fields: { 'take.sg_focal_length': { field: 'sg_lens_mm' }, 'take.sg_t_stop': { display: 'Studio T-Stop' } } });
		expect(changeLines(view)).toEqual([
			{ title: 'Set Shot', detail: 'Shot Code' },
			{ title: 'Take, Focal Length', detail: 'Lens mm' },
			{ title: 'Take, T-Stop', detail: 'Studio T-Stop' }
		]);
	});

	it('names the file for the project, in plain characters', () => {
		expect(namesFileName('Show 2: The Return')).toBe('sg-onset-names-show-2-the-return.json');
		expect(namesFileName('')).toBe('sg-onset-names.json');
	});
});

describe('draftReport', () => {
	it('is the setup report under the names on the page: what Set Up Fields would make', () => {
		const site = review();
		delete site.site.fields.CustomEntity09.sg_tilt;
		const report = draftReport(site, 'https://studio.shotgrid.autodesk.com', { fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' } } });
		expect(report.ready).toBe(false);
		expect(report.fields.filter((f) => f.status === 'missing').map((f) => f.name).sort()).toEqual(['sg_studio_t_stop', 'sg_tilt']);
		expect(report.fields.find((f) => f.name === 'sg_focal_length')?.status).toBe('present');
		expect(report.entities.find((e) => e.scope === 'take')?.status).toBe('found');
	});
});
