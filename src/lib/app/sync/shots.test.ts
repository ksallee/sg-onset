import { describe, expect, it } from 'vitest';
import { mergeOwed, parseOwed, pruneOwed, retryDue, retryItems, serializeOwed, shotsKey, waitingRows, type SlateOwed } from './shots';

const slates = [
	{ id: 's1', slateUID: '12A', vfxShots: ['SMP_012_0010', 'SMP_012_0030'] },
	{ id: 's2', slateUID: '9', vfxShots: ['SMP_009_0010'] },
	{ id: 's3', slateUID: '42A' }
];

const owed = (waiting: string[] = [], several: string[] = [], unlink: string[] = []): SlateOwed => ({ waiting, several, unlink });

describe('the kept list', () => {
	it('is kept per project', () => {
		expect(shotsKey('p1')).toBe('shots:p1');
	});
	it('survives being kept, and anything unreadable is nothing', () => {
		const list = { s1: owed(['SMP_012_0030'], ['SMP_012_0010'], ['SMP_012_0020']) };
		expect(parseOwed(serializeOwed(list))).toEqual(list);
		expect(parseOwed(undefined)).toEqual({});
		expect(parseOwed('{nope')).toEqual({});
		expect(parseOwed(JSON.stringify({ v: 1, slates: { s1: 'SMP', s2: { waiting: ['A', 3], unlink: 'x' } } }))).toEqual({ s2: owed(['A']) });
		expect(parseOwed(JSON.stringify({ v: 2, slates: { s1: owed(['A']) } }))).toEqual({});
	});
});

describe('mergeOwed', () => {
	it('takes the last word on each slate, and forgets a slate with nothing owed', () => {
		const before = { s1: owed(['SMP_012_0010', 'SMP_012_0030']), s2: owed(['SMP_009_0010']) };
		expect(
			mergeOwed(before, [
				{ slate: 's1', ...owed(['SMP_012_0030']) },
				{ slate: 's2', ...owed() },
				{ slate: 's3', ...owed([], ['SMP_042_0010'], ['SMP_042_0020']) }
			])
		).toEqual({ s1: owed(['SMP_012_0030']), s3: owed([], ['SMP_042_0010'], ['SMP_042_0020']) });
		expect(before).toEqual({ s1: owed(['SMP_012_0010', 'SMP_012_0030']), s2: owed(['SMP_009_0010']) });
	});
});

describe('pruneOwed', () => {
	it('keeps the codes to link or name that a slate still holds, as typed now, and only slates still here', () => {
		expect(pruneOwed({ s1: owed(['smp_012_0030', 'SMP_012_0099'], ['SMP_012_0010', 'X']), s3: owed(['SMP_042_0010']), gone: owed(['X'], [], ['Y']) }, slates)).toEqual({
			s1: owed(['SMP_012_0030'], ['SMP_012_0010'])
		});
	});
	it('keeps an unlink owed until the slate holds the code again', () => {
		expect(pruneOwed({ s1: owed([], [], ['SMP_012_0020', 'smp_012_0010']) }, slates)).toEqual({ s1: owed([], [], ['SMP_012_0020']) });
	});
});

describe('retryItems', () => {
	it('asks again for the slates Flow PT holds: link what waits, unlink what is owed, look again at what several Shots share', () => {
		const list = { s1: owed(['SMP_012_0030'], ['SMP_012_0010'], ['SMP_012_0020']), s2: owed(['SMP_009_0010']) };
		expect(retryItems(list, slates, { s1: 501 })).toEqual([{ slate: 's1', remoteId: 501, link: ['SMP_012_0030'], unlink: ['SMP_012_0020'], check: ['SMP_012_0010'] }]);
		expect(retryItems(list, slates, { s1: 'fpt:x' })).toEqual([]);
	});
});

describe('retryDue', () => {
	it('asks again at most once a minute, unless a person asked to sync', () => {
		expect(retryDue(undefined, 1_000)).toBe(true);
		expect(retryDue(1_000, 30_000)).toBe(false);
		expect(retryDue(1_000, 61_000)).toBe(true);
		expect(retryDue(1_000, 30_000, true)).toBe(true);
	});
});

describe('waitingRows', () => {
	it('lists each slate with codes no Shot has or several Shots have, in slate order', () => {
		const list = { s1: owed(['SMP_012_0030'], ['SMP_012_0010']), s2: owed(['SMP_009_0010']), s3: owed(['SMP_042_0010']) };
		expect(waitingRows(list, slates)).toEqual([
			{ slateId: 's2', slate: '9', none: ['SMP_009_0010'], several: [] },
			{ slateId: 's1', slate: '12A', none: ['SMP_012_0030'], several: ['SMP_012_0010'] }
		]);
	});
	it('leaves out an unlink owed: it is made at a later sync and needs no one', () => {
		expect(waitingRows({ s3: owed([], [], ['SMP_042_0010']) }, slates)).toEqual([]);
		expect(waitingRows({}, slates)).toEqual([]);
	});
});
