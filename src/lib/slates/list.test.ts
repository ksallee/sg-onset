import { describe, expect, it } from 'vitest';
import type { Entry } from '$lib/outbox/types';
import type { Slate, Take } from '$lib/model/types';
import { filterSlates, sceneOptions, slatesByDay, sortSlateRows, summarise, takeCount, unsyncedSlateIds, type SlateSummary } from './list';

const days = [
	{ id: 'd1', projectId: 'p', shootDate: '2026-11-09', shootDay: 1 },
	{ id: 'd2', projectId: 'p', shootDate: '2026-11-10', shootDay: 2 },
	{ id: 'd3', projectId: 'p', shootDate: '2026-11-11', shootDay: 3 }
];
const slates = [
	{ id: 's2', shootDayId: 'd2', slateUID: '12B' },
	{ id: 's1', shootDayId: 'd2', slateUID: '12A' },
	{ id: 's3', shootDayId: 'd3', slateUID: '42A' },
	{ id: 'sx', shootDayId: 'other', slateUID: '1' }
];
const takes = [{ slateId: 's1' }, { slateId: 's1' }, { slateId: 's3' }];

describe('slatesByDay', () => {
	it('puts the current day first, then the rest newest first', () => {
		expect(slatesByDay(days, slates, takes, 'd2').map((g) => [g.day.id, g.current])).toEqual([
			['d2', true],
			['d3', false],
			['d1', false]
		]);
	});
	it('is newest first with no current day', () => {
		expect(slatesByDay(days, slates, takes).map((g) => g.day.id)).toEqual(['d3', 'd2', 'd1']);
	});
	it('lists the slates of each day in counting order with their takes', () => {
		const [d2, d3, d1] = slatesByDay(days, slates, takes, 'd2');
		expect(d2.slates.map((r) => [r.slate.slateUID, r.takes])).toEqual([
			['12A', 2],
			['12B', 0]
		]);
		expect(d3.slates.map((r) => [r.slate.slateUID, r.takes])).toEqual([['42A', 1]]);
		expect(d1.slates).toEqual([]);
	});
});

describe('takeCount', () => {
	it('says none, one or many', () => {
		expect(takeCount(0).key).toBe('slates.takes.none');
		expect(takeCount(1).key).toBe('slates.takes.one');
		expect(takeCount(5)).toEqual({ key: 'slates.takes.many', params: { n: 5 } });
	});
});

const day: Slate[] = [
	{ id: 'a', shootDayId: 'd', slateUID: '10', sceneNumber: '7' },
	{ id: 'b', shootDayId: 'd', slateUID: '9', sceneNumber: '12' },
	{ id: 'c', shootDayId: 'd', slateUID: '42A', sceneNumber: '42' },
	{ id: 'e', shootDayId: 'd', slateUID: '42B', sceneNumber: '42' }
];
const shot: Take[] = [
	{ id: 't1', slateId: 'a', take: '1', startedAt: '2026-11-11T10:00:00.000Z', endedAt: '2026-11-11T10:01:00.000Z', noGood: true },
	{ id: 't2', slateId: 'a', take: '2', startedAt: '2026-11-11T10:05:00.000Z', endedAt: '2026-11-11T10:06:30.000Z', circleTake: true },
	{ id: 't3', slateId: 'b', take: '1', startedAt: '2026-11-11T09:00:00.000Z' },
	{ id: 't4', slateId: 'c', take: '1' }
];

describe('summarise', () => {
	const rows = summarise(day, shot, new Set(['b']));
	const of = (id: string) => rows.find((r) => r.slate.id === id)!;

	it('keeps the order it was given', () => {
		expect(rows.map((r) => r.slate.id)).toEqual(['a', 'b', 'c', 'e']);
	});
	it('counts the takes and the marks of each slate', () => {
		expect(of('a')).toMatchObject({ takes: 2, circled: 1, noGood: 1 });
		expect(of('e')).toMatchObject({ takes: 0, circled: 0, noGood: 0 });
	});
	it('spans the first start to the last end, or the last start when a take has no end', () => {
		expect(of('a')).toMatchObject({ start: '2026-11-11T10:00:00.000Z', end: '2026-11-11T10:06:30.000Z' });
		expect(of('b')).toMatchObject({ start: '2026-11-11T09:00:00.000Z', end: '2026-11-11T09:00:00.000Z' });
		expect(of('c').start).toBeUndefined();
	});
	it('says which slates have something not yet synced', () => {
		expect(of('b').unsynced).toBe(true);
		expect(of('a').unsynced).toBe(false);
	});
});

describe('sortSlateRows', () => {
	const rows = summarise(day, shot, new Set());
	const names = (r: SlateSummary[]) => r.map((x) => x.slate.slateUID);
	it('by slate, as a person counts', () => {
		expect(names(sortSlateRows(rows, 'slate'))).toEqual(['9', '10', '42A', '42B']);
	});
	it('by time: first take first, slates never shot last in counting order', () => {
		expect(names(sortSlateRows(rows, 'time'))).toEqual(['9', '10', '42A', '42B']);
		const later = summarise(day, [{ id: 'x', slateId: 'e', startedAt: '2026-11-11T08:00:00.000Z' }, ...shot], new Set());
		expect(names(sortSlateRows(later, 'time'))).toEqual(['42B', '9', '10', '42A']);
	});
	it('by scene, then slate', () => {
		expect(names(sortSlateRows(rows, 'scene'))).toEqual(['10', '9', '42A', '42B']);
	});
});

describe('filterSlates', () => {
	const rows = summarise(day, shot, new Set(['c']));
	const ids = (r: SlateSummary[]) => r.map((x) => x.slate.id);
	it('keeps everything with no filter', () => {
		expect(ids(filterSlates(rows, {}))).toEqual(['a', 'b', 'c', 'e']);
	});
	it('by scene', () => {
		expect(ids(filterSlates(rows, { scene: '42' }))).toEqual(['c', 'e']);
	});
	it('to slates with a no good take, or with something unsynced, together', () => {
		expect(ids(filterSlates(rows, { noGood: true }))).toEqual(['a']);
		expect(ids(filterSlates(rows, { unsynced: true }))).toEqual(['c']);
		expect(ids(filterSlates(rows, { noGood: true, unsynced: true }))).toEqual([]);
	});
});

describe('sceneOptions', () => {
	it('lists each scene once, as a person counts, and skips blanks', () => {
		expect(sceneOptions([...day, { id: 'z', shootDayId: 'd', slateUID: '1', sceneNumber: ' ' }])).toEqual(['7', '12', '42']);
	});
});

describe('unsyncedSlateIds', () => {
	const entry = (table: string, recordId: string, state: Entry['state'] = 'pending') => ({ id: recordId, seq: 1, op: { kind: 'update', table, recordId, changes: {} }, state }) as unknown as Entry;
	it('collects slates with an entry not yet confirmed, of their own or of one of their takes', () => {
		const ids = unsyncedSlateIds([entry('slate', 'a'), entry('take', 't3'), entry('take', 't2', 'confirmed'), entry('take', 'gone')], shot);
		expect([...ids].sort()).toEqual(['a', 'b']);
	});
});
