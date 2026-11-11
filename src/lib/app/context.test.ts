import { describe, expect, it } from 'vitest';
import type { ShootDay, Slate } from '$lib/model/types';
import { dayName, nextDayNumber, pickCurrent, pickExact, sortProjects, sortShootDays, sortSlates } from './context';

const day = (id: string, shootDate: string, shootDay?: number): ShootDay => ({ id, projectId: 'p', shootDate, ...(shootDay ? { shootDay } : {}) });
const slate = (slateUID: string): Slate => ({ id: slateUID, shootDayId: 'd', slateUID });

describe('sorting', () => {
	it('lists projects by name, whatever the case', () => {
		expect(sortProjects([{ id: '1', name: 'zebra' }, { id: '2', name: 'Alpha' }, { id: '3' }]).map((p) => p.id)).toEqual(['3', '2', '1']);
	});
	it('lists shoot days newest first', () => {
		const days = [day('a', '2026-11-09', 1), day('b', '2026-11-11', 3), day('c', '2026-11-10', 2)];
		expect(sortShootDays(days).map((d) => d.id)).toEqual(['b', 'c', 'a']);
	});
	it('breaks a tie on the date by the day number', () => {
		expect(sortShootDays([day('a', '2026-11-11', 1), day('b', '2026-11-11', 2)]).map((d) => d.id)).toEqual(['b', 'a']);
	});
	it('lists slates as a person counts', () => {
		expect(sortSlates(['42B', '10', '9', '42A', '42'].map(slate)).map((s) => s.slateUID)).toEqual(['9', '10', '42', '42A', '42B']);
	});
	it('leaves the input alone', () => {
		const days = [day('a', '2026-11-09'), day('b', '2026-11-11')];
		sortShootDays(days);
		expect(days.map((d) => d.id)).toEqual(['a', 'b']);
	});
});

describe('pickCurrent', () => {
	const rows = [{ id: 'a' }, { id: 'b' }];
	it('finds the one asked for', () => {
		expect(pickCurrent(rows, 'b')).toBe(rows[1]);
	});
	it('falls back to the first when the one asked for is gone or was never set', () => {
		expect(pickCurrent(rows, 'zz')).toBe(rows[0]);
		expect(pickCurrent(rows, undefined)).toBe(rows[0]);
	});
	it('has nothing to give from an empty list', () => {
		expect(pickCurrent([], 'a')).toBeUndefined();
	});
});

describe('pickExact', () => {
	it('never picks another', () => {
		const rows = [{ id: 'a' }];
		expect(pickExact(rows, 'a')).toBe(rows[0]);
		expect(pickExact(rows, 'b')).toBeUndefined();
		expect(pickExact(rows, undefined)).toBeUndefined();
	});
});

describe('shoot day numbers', () => {
	it('gives the next number', () => {
		expect(nextDayNumber([])).toBe(1);
		expect(nextDayNumber([day('a', '2026-11-09', 1), day('b', '2026-11-11', 4), day('c', '2026-11-12')])).toBe(5);
	});
	it('names a day by its number, or plainly', () => {
		expect(dayName({ shootDay: 3 })).toEqual({ key: 'context.day', params: { n: 3 } });
		expect(dayName({}).key).toBe('context.day.unnumbered');
	});
});
