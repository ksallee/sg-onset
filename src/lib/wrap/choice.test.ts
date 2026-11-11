import { describe, expect, it } from 'vitest';
import { day3, day4 } from '$lib/export/testData';
import { defaultChoice, exportFilters, pickedDays, readiness, setSpan, toggleDay, toggleFile, wantsText } from './choice';

const days = [day4, day3];

describe('defaultChoice', () => {
	it('is the current day, every file, no filters, CRIF lengths as the spec says', () => {
		const c = defaultChoice();
		expect(c.span).toBe('day');
		expect(c.files).toEqual(['crif', 'plainCsv', 'ale', 'json', 'photos', 'report']);
		expect(c.circledOnly).toBe(false);
		expect(c.excludeNoGood).toBe(false);
		expect(c.lengths).toBe('imperial');
		expect(c.plainUnits).toBe('inline');
	});
});

describe('pickedDays', () => {
	it('gives the current day for a day', () => {
		expect(pickedDays(defaultChoice(), 'd3', days).map((d) => d.id)).toEqual(['d3']);
	});
	it('gives none when the current day is gone', () => {
		expect(pickedDays(defaultChoice(), 'gone', days)).toEqual([]);
		expect(pickedDays(defaultChoice(), undefined, days)).toEqual([]);
	});
	it('gives the days picked, oldest first, and drops a day that is gone', () => {
		const c = { ...defaultChoice(), span: 'days' as const, dayIds: ['d4', 'gone', 'd3'] };
		expect(pickedDays(c, 'd3', days).map((d) => d.id)).toEqual(['d3', 'd4']);
	});
	it('gives every day for the project', () => {
		expect(pickedDays({ ...defaultChoice(), span: 'project' }, undefined, days).map((d) => d.id)).toEqual(['d3', 'd4']);
	});
});

describe('exportFilters', () => {
	it('names the days and the take filters', () => {
		const c = { ...defaultChoice(), circledOnly: true, excludeNoGood: true };
		expect(exportFilters(c, 'd4', days)).toEqual({ shootDayIds: ['d4'], circledOnly: true, excludeNoGood: true });
	});
	it('never means every day by an empty list', () => {
		// flatten reads an empty list as every day: a day that is gone must keep nothing.
		expect(exportFilters(defaultChoice(), 'gone', days).shootDayIds).toEqual(['∅']);
	});
});

describe('setSpan', () => {
	it('seeds several days with the current one', () => {
		expect(setSpan(defaultChoice(), 'days', 'd3').dayIds).toEqual(['d3']);
	});
	it('keeps days already picked', () => {
		const c = { ...defaultChoice(), dayIds: ['d4'] };
		expect(setSpan(c, 'days', 'd3').dayIds).toEqual(['d4']);
	});
});

describe('toggles', () => {
	it('turns a file off and on, in the fixed order', () => {
		const off = toggleFile(defaultChoice(), 'ale');
		expect(off.files).not.toContain('ale');
		expect(toggleFile(off, 'ale').files).toEqual(defaultChoice().files);
	});
	it('turns a day off and on', () => {
		const c = toggleDay({ ...defaultChoice(), dayIds: ['d3'] }, 'd4');
		expect(c.dayIds).toEqual(['d3', 'd4']);
		expect(toggleDay(c, 'd3').dayIds).toEqual(['d4']);
	});
});

describe('readiness', () => {
	it('needs a file and a day', () => {
		expect(readiness(defaultChoice(), 1)).toBe('ok');
		expect(readiness({ ...defaultChoice(), files: [] }, 1)).toBe('noFiles');
		expect(readiness(defaultChoice(), 0)).toBe('noDays');
	});
});

describe('wantsText', () => {
	it('lists the table files picked', () => {
		expect(wantsText({ ...defaultChoice(), files: ['photos', 'ale', 'crif'] })).toEqual(['crif', 'ale']);
	});
});
