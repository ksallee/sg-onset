import { describe, expect, it } from 'vitest';
import { bulkEdit } from './bulkEdit';
import { applyPatch } from './patch';
import type { Take } from './types';

const takes: Take[] = [
	{ id: 'a', slateId: 's', take: '1', tStop: 2.8, filter: 'ND.6' },
	{ id: 'b', slateId: 's', take: '2', tStop: 4 },
	{ id: 'c', slateId: 's', take: '3' },
	{ id: 'd', slateId: 's', take: '4', tStop: 5.6 }
];

describe('bulkEdit', () => {
	it('sets the field on the chosen records only', () => {
		const { records } = bulkEdit(takes, ['a', 'b', 'c'], 'tStop', 5.6);
		expect(records.map((t) => t.tStop)).toEqual([5.6, 5.6, 5.6, 5.6]);
		expect(records[3]).toBe(takes[3]);
		expect(records[0]).toMatchObject({ id: 'a', take: '1', filter: 'ND.6' });
	});

	it('clears the field when the value is undefined', () => {
		const { records } = bulkEdit(takes, ['a', 'c'], 'filter', undefined);
		expect('filter' in records[0]).toBe(false);
		expect(records[2]).toBe(takes[2]);
	});

	it('returns a patch of what changed, skipping records already at the value', () => {
		const { patch } = bulkEdit(takes, ['a', 'b', 'c', 'd'], 'tStop', 5.6);
		expect(patch).toEqual([
			{ id: 'a', key: 'tStop', from: 2.8, to: 5.6 },
			{ id: 'b', key: 'tStop', from: 4, to: 5.6 },
			{ id: 'c', key: 'tStop', from: undefined, to: 5.6 }
		]);
	});

	it('returns an inverse patch that puts every old value back', () => {
		const { records, inverse } = bulkEdit(takes, ['a', 'b', 'c', 'd'], 'tStop', 5.6);
		expect(applyPatch(records, inverse)).toEqual(takes);
	});

	it('leaves the input alone and ignores ids that are not there', () => {
		const before = structuredClone(takes);
		const { records, patch } = bulkEdit(takes, ['zz'], 'tStop', 8);
		expect(takes).toEqual(before);
		expect(records).toEqual(takes);
		expect(patch).toEqual([]);
	});

	it('sets a length, and skips one already at the same metres', () => {
		const withHeights: Take[] = [
			{ id: 'a', slateId: 's', lensHeight: { m: 1.8288 } },
			{ id: 'b', slateId: 's', lensHeight: { m: 1.2 } }
		];
		const typed = { m: 1.8288, entered: { text: `6'`, system: 'imperial' as const } };
		const { records, patch } = bulkEdit(withHeights, ['a', 'b'], 'lensHeight', typed);
		expect(patch).toEqual([{ id: 'b', key: 'lensHeight', from: { m: 1.2 }, to: typed }]);
		expect(records[0]).toBe(withHeights[0]);
		expect(records[1].lensHeight).toEqual(typed);
	});
});
