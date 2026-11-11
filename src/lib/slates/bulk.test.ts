import { describe, expect, it } from 'vitest';
import type { Take } from '$lib/model/types';
import { bulkFields, bulkPreview, linkPreview } from './bulk';

const takes: Take[] = [
	{ id: 'a', slateId: 's', take: '1', tStop: 2.8 },
	{ id: 'b', slateId: 's', take: '2', tStop: 4 },
	{ id: 'c', slateId: 's', take: '3' },
	{ id: 'd', slateId: 's', take: '4', tStop: 4 }
];

describe('bulkFields', () => {
	const keys = bulkFields().map((f) => f.key);
	it('offers the take fields that many takes can share', () => {
		expect(keys).toEqual(expect.arrayContaining(['tStop', 'lensHeight', 'lensHeightEnd', 'circleTake', 'noGood', 'notes', 'lensId', 'filter']));
	});
	it('leaves out the take number and the times, which belong to one take each', () => {
		expect(keys).not.toContain('take');
		expect(keys).not.toContain('startedAt');
		expect(keys).not.toContain('endedAt');
	});
});

describe('bulkPreview', () => {
	it('splits the chosen takes into those that change and those already at the value', () => {
		expect(bulkPreview(takes, ['a', 'b', 'c'], 'tStop', 4)).toEqual({ change: ['a', 'c'], already: ['b'] });
	});
	it('counts a clear: takes with nothing there are already clear', () => {
		expect(bulkPreview(takes, ['a', 'b', 'c'], 'tStop', undefined)).toEqual({ change: ['a', 'b'], already: ['c'] });
	});
	it('ignores ids that are not there', () => {
		expect(bulkPreview(takes, ['a', 'zz'], 'tStop', 2.8)).toEqual({ change: [], already: ['a'] });
	});
});

describe('linkPreview', () => {
	const template = { id: 'tp', values: { tStop: 4, isoSpeed: 800 } };
	const linked: Take[] = [
		{ id: 'x', slateId: 's', templateId: 'tp', tStop: 4, isoSpeed: 800 },
		{ id: 'y', slateId: 's', tStop: 4 },
		{ id: 'z', slateId: 's', templateId: 'other', tStop: 2 }
	];
	it('builds the patch that links takes to a template and fills its fields, skipping takes already there', () => {
		const { patch, change, already } = linkPreview(linked, ['x', 'y', 'z'], template);
		expect(change).toEqual(['y', 'z']);
		expect(already).toEqual(['x']);
		expect(patch).toEqual([
			{ id: 'y', key: 'templateId', from: undefined, to: 'tp' },
			{ id: 'y', key: 'isoSpeed', from: undefined, to: 800 },
			{ id: 'z', key: 'templateId', from: 'other', to: 'tp' },
			{ id: 'z', key: 'tStop', from: 2, to: 4 },
			{ id: 'z', key: 'isoSpeed', from: undefined, to: 800 }
		]);
	});
});
