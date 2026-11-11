import { describe, expect, it } from 'vitest';
import { applyPatch, change, invertPatch, type Patch } from './patch';

type Row = { id: string; take?: string; tStop?: number; notes?: string };

const rows: Row[] = [
	{ id: 'a', take: '1', tStop: 2.8 },
	{ id: 'b', take: '2', tStop: 2.8 },
	{ id: 'c', take: '3' }
];

describe('change', () => {
	it('records the value before and after', () => {
		expect(change(rows[0], 'tStop', 4)).toEqual({ id: 'a', key: 'tStop', from: 2.8, to: 4 });
		expect(change(rows[2], 'tStop', 4)).toEqual({ id: 'c', key: 'tStop', from: undefined, to: 4 });
	});
});

describe('applyPatch', () => {
	const patch: Patch = [
		{ id: 'a', key: 'tStop', from: 2.8, to: 4 },
		{ id: 'c', key: 'tStop', from: undefined, to: 4 },
		{ id: 'c', key: 'notes', from: undefined, to: 'wide' }
	];

	it('sets each value on its record', () => {
		expect(applyPatch(rows, patch)).toEqual([
			{ id: 'a', take: '1', tStop: 4 },
			{ id: 'b', take: '2', tStop: 2.8 },
			{ id: 'c', take: '3', tStop: 4, notes: 'wide' }
		]);
	});

	it('removes a key set to undefined', () => {
		const out = applyPatch(rows, [{ id: 'a', key: 'tStop', from: 2.8, to: undefined }]);
		expect(out[0]).toEqual({ id: 'a', take: '1' });
		expect('tStop' in out[0]).toBe(false);
	});

	it('leaves the input alone and keeps untouched records as they are', () => {
		const before = structuredClone(rows);
		const out = applyPatch(rows, patch);
		expect(rows).toEqual(before);
		expect(out[1]).toBe(rows[1]);
		expect(out[0]).not.toBe(rows[0]);
	});

	it('skips a change whose record is gone', () => {
		expect(applyPatch(rows, [{ id: 'zz', key: 'tStop', from: 1, to: 2 }])).toEqual(rows);
	});

	it('applies changes to one key in order: the last wins', () => {
		const out = applyPatch(rows, [
			{ id: 'a', key: 'tStop', from: 2.8, to: 4 },
			{ id: 'a', key: 'tStop', from: 4, to: 5.6 }
		]);
		expect(out[0].tStop).toBe(5.6);
	});
});

describe('invertPatch', () => {
	it('undoes a patch, and undoing the undo redoes it', () => {
		const patch: Patch = [
			{ id: 'a', key: 'tStop', from: 2.8, to: 4 },
			{ id: 'a', key: 'tStop', from: 4, to: 5.6 },
			{ id: 'c', key: 'notes', from: undefined, to: 'wide' },
			{ id: 'b', key: 'take', from: '2', to: undefined }
		];
		const done = applyPatch(rows, patch);
		const inverse = invertPatch(patch);
		expect(applyPatch(done, inverse)).toEqual(rows);
		expect(applyPatch(applyPatch(done, inverse), invertPatch(inverse))).toEqual(done);
	});
});
