import { describe, expect, it } from 'vitest';
import { mergeWaiting, parseWaiting, pruneWaiting, retryDue, retryItems, serializeWaiting, shotsKey, waitingRows } from './shots';

const slates = [
	{ id: 's1', slateUID: '12A', vfxShots: ['SMP_012_0010', 'SMP_012_0030'] },
	{ id: 's2', slateUID: '9', vfxShots: ['SMP_009_0010'] },
	{ id: 's3', slateUID: '42A' }
];

describe('the kept list', () => {
	it('is kept per project', () => {
		expect(shotsKey('p1')).toBe('shots:p1');
	});
	it('survives being kept, and anything unreadable is nothing', () => {
		const waiting = { s1: ['SMP_012_0030'] };
		expect(parseWaiting(serializeWaiting(waiting))).toEqual(waiting);
		expect(parseWaiting(undefined)).toEqual({});
		expect(parseWaiting('{nope')).toEqual({});
		expect(parseWaiting(JSON.stringify({ v: 1, slates: { s1: 'SMP', s2: ['A', 3] } }))).toEqual({ s2: ['A'] });
		expect(parseWaiting(JSON.stringify({ v: 2, slates: { s1: ['A'] } }))).toEqual({});
	});
});

describe('mergeWaiting', () => {
	it('takes the last word on each slate, and forgets a slate with nothing left', () => {
		const before = { s1: ['SMP_012_0010', 'SMP_012_0030'], s2: ['SMP_009_0010'] };
		expect(
			mergeWaiting(before, [
				{ slate: 's1', waiting: ['SMP_012_0030'] },
				{ slate: 's2', waiting: [] },
				{ slate: 's3', waiting: ['SMP_042_0010'] }
			])
		).toEqual({ s1: ['SMP_012_0030'], s3: ['SMP_042_0010'] });
		expect(before).toEqual({ s1: ['SMP_012_0010', 'SMP_012_0030'], s2: ['SMP_009_0010'] });
	});
});

describe('pruneWaiting', () => {
	it('keeps only the codes a slate still holds, as typed now, and only slates still here', () => {
		expect(pruneWaiting({ s1: ['smp_012_0030', 'SMP_012_0099'], s3: ['SMP_042_0010'], gone: ['X'] }, slates)).toEqual({ s1: ['SMP_012_0030'] });
	});
});

describe('retryItems', () => {
	it('asks again for the slates Flow PT holds, with the codes they still hold', () => {
		const waiting = { s1: ['SMP_012_0030'], s2: ['SMP_009_0010'] };
		expect(retryItems(waiting, slates, { s1: 501 })).toEqual([{ slate: 's1', remoteId: 501, codes: ['SMP_012_0030'] }]);
		expect(retryItems(waiting, slates, { s1: 'fpt:x' })).toEqual([]);
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
	it('lists each slate with codes that wait, in slate order', () => {
		const waiting = { s1: ['SMP_012_0030'], s2: ['SMP_009_0010'], s3: ['SMP_042_0010'] };
		expect(waitingRows(waiting, slates)).toEqual([
			{ slateId: 's2', slate: '9', codes: ['SMP_009_0010'] },
			{ slateId: 's1', slate: '12A', codes: ['SMP_012_0030'] }
		]);
	});
	it('is empty when nothing waits', () => {
		expect(waitingRows({}, slates)).toEqual([]);
	});
});
