import { describe, expect, it } from 'vitest';
import { legacyKeys, linkDue, linkItems, mergeSeveral, projectSlates, severalRows, waitingForSetShot } from './shots';

const slates = [
	{ id: 's1', shootDayId: 'd1', slateUID: '12A', vfxShots: ['SMP_012_0010', 'SMP_012_0030'] },
	{ id: 's2', shootDayId: 'd1', slateUID: '9', vfxShots: ['SMP_009_0010'] },
	{ id: 's3', shootDayId: 'd2', slateUID: '42A' }
];

describe('projectSlates', () => {
	it('keeps the slates of the shoot days of a project', () => {
		const days = [
			{ id: 'd1', projectId: 'p1' },
			{ id: 'd2', projectId: 'p2' }
		];
		expect(projectSlates(days, slates, 'p1').map((s) => s.id)).toEqual(['s1', 's2']);
	});
});

describe('linkItems', () => {
	// Kevin, #102: nothing about links is kept on the device. Each sync brings every slate in line.
	it('brings in line every slate Flow PT holds, with the codes it holds now, none for a slate with none', () => {
		expect(linkItems(slates, { s1: 501, s3: 503, s2: 'fpt:x' })).toEqual([
			{ slate: 's1', remoteId: 501, codes: ['SMP_012_0010', 'SMP_012_0030'] },
			{ slate: 's3', remoteId: 503, codes: [] }
		]);
	});
});

describe('linkDue', () => {
	it('brings the links in line at most once a minute, unless a person asked to sync', () => {
		expect(linkDue(undefined, 1_000)).toBe(true);
		expect(linkDue(1_000, 30_000)).toBe(false);
		expect(linkDue(1_000, 61_000)).toBe(true);
		expect(linkDue(1_000, 30_000, true)).toBe(true);
	});
});

describe('mergeSeveral', () => {
	it('takes what a sync read: the whole list from a sync of every slate, a slate at a time from a push', () => {
		const before = { s1: ['SMP_012_0010'], s2: ['SMP_009_0010'] };
		expect(mergeSeveral(before, [{ slate: 's1', several: [], shots: [] }, { slate: 's3', several: ['X'], shots: [] }])).toEqual({ s2: ['SMP_009_0010'], s3: ['X'] });
		expect(mergeSeveral(before, [{ slate: 's3', several: ['X'], shots: [] }], true)).toEqual({ s3: ['X'] });
		expect(before).toEqual({ s1: ['SMP_012_0010'], s2: ['SMP_009_0010'] });
	});
});

describe('severalRows', () => {
	it('lists each slate with codes several Shots have, as typed now, in slate order', () => {
		expect(severalRows({ s1: ['smp_012_0010', 'SMP_099_0010'], s2: ['SMP_009_0010'], gone: ['X'] }, slates)).toEqual([
			{ slateId: 's2', slate: '9', several: ['SMP_009_0010'] },
			{ slateId: 's1', slate: '12A', several: ['SMP_012_0010'] }
		]);
		expect(severalRows({}, slates)).toEqual([]);
	});
});

describe('waitingForSetShot', () => {
	// Kevin, #117: on a site without Set Shot, the sync sheet says what waits for it.
	it('counts the slates whose codes wait for Set Shot', () => {
		expect(waitingForSetShot(slates)).toBe(2);
		expect(waitingForSetShot([{ id: 's', vfxShots: [' '] }])).toBe(0);
	});
});

describe('legacyKeys', () => {
	// The lists #96 kept, and the matched Set Shots this change kept at first: no longer read.
	it('names the keys an older version kept for a project', () => {
		expect(legacyKeys('p1')).toEqual(['shots:p1', 'setShots:p1']);
	});
});
