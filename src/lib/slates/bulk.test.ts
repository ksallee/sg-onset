import { describe, expect, it } from 'vitest';
import type { Take } from '$lib/model/types';
import { fieldLabel } from '$lib/i18n/modelText';
import { bulkFields, bulkPatch, bulkPreview, bulkValue, linkPreview } from './bulk';

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
	it('offers each plate at the tail as its own yes or no, right after the type (Kevin, #108)', () => {
		expect(keys).not.toContain('takeTail');
		const at = keys.indexOf('takeType');
		expect(keys.slice(at + 1, at + 3)).toEqual(['takeTail.cleanPlate', 'takeTail.ballsAndChart']);
		const plates = bulkFields().filter((f) => f.key.startsWith('takeTail.'));
		expect(plates.map((f) => f.def.type)).toEqual(['boolean', 'boolean']);
		expect(plates.map((f) => fieldLabel(f.def))).toEqual(['Clean plate at the tail', 'Balls and chart at the tail']);
	});
});

describe('a plate at the tail in bulk edit', () => {
	const tailed: Take[] = [
		{ id: 'a', slateId: 's', take: '1' },
		{ id: 'b', slateId: 's', take: '2', takeTail: ['ballsAndChart'] },
		{ id: 'c', slateId: 's', take: '3', takeTail: ['cleanPlate'] },
		{ id: 'd', slateId: 's', take: '4', takeTail: ['cleanPlate', 'ballsAndChart'] }
	];
	it('puts the plate on the chosen takes, keeping the other plate', () => {
		expect(bulkPatch(tailed, ['a', 'b', 'c'], 'takeTail.cleanPlate', true)).toEqual([
			{ id: 'a', key: 'takeTail', from: undefined, to: ['cleanPlate'] },
			{ id: 'b', key: 'takeTail', from: ['ballsAndChart'], to: ['cleanPlate', 'ballsAndChart'] }
		]);
		expect(bulkPreview(tailed, ['a', 'b', 'c'], 'takeTail.cleanPlate', true)).toEqual({ change: ['a', 'b'], already: ['c'] });
	});
	it('takes the plate off for No or Clear, keeping the other; an empty tail is no value', () => {
		const off = [
			{ id: 'c', key: 'takeTail', from: ['cleanPlate'], to: undefined },
			{ id: 'd', key: 'takeTail', from: ['cleanPlate', 'ballsAndChart'], to: ['ballsAndChart'] }
		];
		expect(bulkPatch(tailed, ['a', 'b', 'c', 'd'], 'takeTail.cleanPlate', false)).toEqual(off);
		expect(bulkPatch(tailed, ['a', 'b', 'c', 'd'], 'takeTail.cleanPlate', undefined)).toEqual(off);
		expect(bulkPreview(tailed, ['a', 'b', 'c', 'd'], 'takeTail.cleanPlate', undefined)).toEqual({ change: ['c', 'd'], already: ['a', 'b'] });
	});
});

describe('bulkValue', () => {
	it('reads a plate at the tail as yes or nothing, and any other field as stored', () => {
		const take: Take = { id: 'a', slateId: 's', takeTail: ['ballsAndChart'], tStop: 2.8 };
		expect(bulkValue(take, 'takeTail.ballsAndChart')).toBe(true);
		expect(bulkValue(take, 'takeTail.cleanPlate')).toBeUndefined();
		expect(bulkValue(take, 'tStop')).toBe(2.8);
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
	it('counts a take with no type as Main already', () => {
		const typed: Take[] = [
			{ id: 'a', slateId: 's', takeType: 'cleanPlate' },
			{ id: 'b', slateId: 's' }
		];
		expect(bulkPreview(typed, ['a', 'b'], 'takeType', 'main')).toEqual({ change: ['a'], already: ['b'] });
	});
});

describe('bulkPatch', () => {
	it('sets the field on the chosen takes that do not hold the value', () => {
		expect(bulkPatch(takes, ['a', 'b'], 'tStop', 4)).toEqual([{ id: 'a', key: 'tStop', from: 2.8, to: 4 }]);
	});
	it('writes Main as no value', () => {
		const typed: Take[] = [
			{ id: 'a', slateId: 's', takeType: 'cleanPlate' },
			{ id: 'b', slateId: 's' }
		];
		expect(bulkPatch(typed, ['a', 'b'], 'takeType', 'main')).toEqual([{ id: 'a', key: 'takeType', from: 'cleanPlate', to: undefined }]);
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
