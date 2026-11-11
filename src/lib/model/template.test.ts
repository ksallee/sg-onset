import { describe, expect, it } from 'vitest';
import { applyPatch } from './patch';
import { applyTemplateEdit, createFromTemplate, previewTemplateEdit, type Template } from './template';
import type { Take } from './types';

const feet6 = { m: 1.8288, entered: { text: `6'`, system: 'imperial' as const } };

const old: Template<'take'> = {
	id: 'tpl',
	name: 'Day ext',
	scope: 'take',
	values: { tStop: 2.8, isoSpeed: 800, shutterAngle: 180, lensHeight: feet6, filter: 'ND.6' }
};

/** tStop 2.8 → 5.6, isoSpeed unchanged, shutterAngle unchanged, filter removed, whiteBalance added. */
const edited: Template<'take'> = {
	...old,
	values: { tStop: 5.6, isoSpeed: 800, shutterAngle: 180, lensHeight: feet6, whiteBalance: 5600 }
};

const takes: Take[] = [
	// Still as the template made it.
	{ id: 'same', slateId: 's', templateId: 'tpl', take: '1', tStop: 2.8, isoSpeed: 800, shutterAngle: 180, lensHeight: { m: 1.8288 }, filter: 'ND.6' },
	// Stop, filter and white balance set by hand; iso changed by hand too.
	{ id: 'hand', slateId: 's', templateId: 'tpl', take: '2', tStop: 4, isoSpeed: 1600, shutterAngle: 180, filter: 'Pola', whiteBalance: 3200 },
	// From another template.
	{ id: 'other', slateId: 's', templateId: 'tpl2', take: '3', tStop: 2.8, filter: 'ND.6' },
	// From no template.
	{ id: 'free', slateId: 's', take: '4', tStop: 2.8 }
];

describe('createFromTemplate', () => {
	it('fills a record from the template and links it', () => {
		expect(createFromTemplate(old, { id: 'n', slateId: 's', take: '1' })).toEqual({
			id: 'n',
			slateId: 's',
			templateId: 'tpl',
			take: '1',
			tStop: 2.8,
			isoSpeed: 800,
			shutterAngle: 180,
			lensHeight: feet6,
			filter: 'ND.6'
		});
	});

	it('lets the base win over the template', () => {
		expect(createFromTemplate(old, { id: 'n', slateId: 's', tStop: 8 }).tStop).toBe(8);
	});
});

describe('previewTemplateEdit', () => {
	const preview = previewTemplateEdit(takes, old, edited);

	it('lists each field that would change on each linked record', () => {
		expect(preview).toEqual([
			{ id: 'same', key: 'tStop', from: 2.8, to: 5.6, touched: false },
			{ id: 'same', key: 'filter', from: 'ND.6', to: undefined, touched: false },
			{ id: 'same', key: 'whiteBalance', from: undefined, to: 5600, touched: false },
			{ id: 'hand', key: 'tStop', from: 4, to: 5.6, touched: true },
			{ id: 'hand', key: 'whiteBalance', from: 3200, to: 5600, touched: true }
		]);
	});

	it('leaves alone records from another template or none', () => {
		expect(preview.some((c) => c.id === 'other' || c.id === 'free')).toBe(false);
	});

	it('leaves alone a field the edit did not change, even one changed by hand', () => {
		expect(preview.some((c) => c.key === 'isoSpeed' || c.key === 'shutterAngle' || c.key === 'lensHeight')).toBe(false);
	});

	it('never clears a hand-typed value when the template drops the field', () => {
		expect(preview.some((c) => c.id === 'hand' && c.key === 'filter')).toBe(false);
	});

	it('lists nothing for a record already at the new value', () => {
		const at: Take[] = [{ id: 'x', slateId: 's', templateId: 'tpl', tStop: 5.6, filter: undefined, whiteBalance: 5600 }];
		expect(previewTemplateEdit(at, old, edited)).toEqual([]);
	});

	it('lists nothing when the template did not change', () => {
		const renamed: Template<'take'> = { ...old, name: 'Renamed' };
		expect(previewTemplateEdit(takes, old, renamed)).toEqual([]);
	});

	it('counts a length as untouched when its metres match, whatever was typed', () => {
		const lower: Template<'take'> = { ...old, values: { ...old.values, lensHeight: { m: 1.2 } } };
		expect(previewTemplateEdit(takes, old, lower)).toEqual([
			{ id: 'same', key: 'lensHeight', from: { m: 1.8288 }, to: { m: 1.2 }, touched: false },
			{ id: 'hand', key: 'lensHeight', from: undefined, to: { m: 1.2 }, touched: true }
		]);
	});
});

describe('applyTemplateEdit', () => {
	it('untouched: updates only fields still holding the old template value', () => {
		const { records } = applyTemplateEdit(takes, old, edited, 'untouched');
		expect(records[0]).toEqual({ id: 'same', slateId: 's', templateId: 'tpl', take: '1', tStop: 5.6, isoSpeed: 800, shutterAngle: 180, lensHeight: { m: 1.8288 }, whiteBalance: 5600 });
		expect(records[1]).toBe(takes[1]);
		expect(records[2]).toBe(takes[2]);
		expect(records[3]).toBe(takes[3]);
	});

	it('all: updates every field the edit changed, hand-typed or not', () => {
		const { records } = applyTemplateEdit(takes, old, edited, 'all');
		expect(records[0]).toMatchObject({ tStop: 5.6, whiteBalance: 5600 });
		expect(records[1]).toEqual({ id: 'hand', slateId: 's', templateId: 'tpl', take: '2', tStop: 5.6, isoSpeed: 1600, shutterAngle: 180, filter: 'Pola', whiteBalance: 5600 });
		expect(records[2]).toBe(takes[2]);
	});

	it('returns the patch it applied and the patch that undoes it', () => {
		for (const mode of ['untouched', 'all'] as const) {
			const { records, patch, inverse } = applyTemplateEdit(takes, old, edited, mode);
			expect(applyPatch(takes, patch)).toEqual(records);
			expect(applyPatch(records, inverse)).toEqual(takes);
		}
	});

	it('changes nothing when no record is linked', () => {
		const { records, patch } = applyTemplateEdit(takes.slice(2), old, edited, 'all');
		expect(records).toEqual(takes.slice(2));
		expect(patch).toEqual([]);
	});
});
