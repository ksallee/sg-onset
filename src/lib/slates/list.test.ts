import { describe, expect, it } from 'vitest';
import { slatesByDay, takeCount } from './list';

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
