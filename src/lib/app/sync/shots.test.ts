import { describe, expect, it } from 'vitest';
import {
	addMatched,
	matchedKey,
	mergeOwed,
	parseMatched,
	parseOwed,
	pruneOwed,
	retryDue,
	retryItems,
	serializeMatched,
	serializeOwed,
	severalRows,
	shotsKey,
	type SlateOwed
} from './shots';

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

describe('severalRows', () => {
	it('lists each slate with codes several Shots have, in slate order', () => {
		const list = { s1: owed(['SMP_012_0030'], ['SMP_012_0010']), s2: owed([], ['SMP_009_0010']), s3: owed(['SMP_042_0010']) };
		expect(severalRows(list, slates)).toEqual([
			{ slateId: 's2', slate: '9', several: ['SMP_009_0010'] },
			{ slateId: 's1', slate: '12A', several: ['SMP_012_0010'] }
		]);
	});
	// Kevin, #102: a code with no Shot is filed as a Set Shot, which is expected. Nobody need look.
	it('leaves out a code no Shot has yet, and an unlink owed: later syncs make them', () => {
		expect(severalRows({ s1: owed(['SMP_012_0030']), s3: owed([], [], ['SMP_042_0010']) }, slates)).toEqual([]);
		expect(severalRows({}, slates)).toEqual([]);
	});
});

describe('the matched Set Shots', () => {
	it('are kept per project', () => {
		expect(matchedKey('p1')).toBe('setShots:p1');
	});
	it('survive being kept, each once, and anything unreadable is none', () => {
		expect(parseMatched(serializeMatched(addMatched([300], [302, 300, 301])))).toEqual([300, 301, 302]);
		expect(parseMatched(undefined)).toEqual([]);
		expect(parseMatched('{nope')).toEqual([]);
		expect(parseMatched(JSON.stringify({ v: 1, ids: [300, 'x', 1.5, 301] }))).toEqual([300, 301]);
		expect(parseMatched(JSON.stringify({ v: 2, ids: [300] }))).toEqual([]);
	});
});
