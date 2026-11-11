import { describe, expect, it } from 'vitest';
import { afterCreate, draftOf, entryRoute, firstProblem, firstRunMode, firstRunProblems, installOffer, parseDraft, serializeDraft } from './firstRun';

const ok = { name: 'The Long Night', date: '2026-11-11', dayNumber: '1', unit: '', location: '' };

describe('entryRoute', () => {
	it('sends a new device to the first run and a returning one to Shoot', () => {
		expect(entryRoute(0)).toBe('/welcome');
		expect(entryRoute(1)).toBe('/shoot');
		expect(entryRoute(200)).toBe('/shoot');
	});
});

describe('firstRunMode', () => {
	it('is the first run with no project, else one more project', () => {
		expect(firstRunMode(0)).toBe('first');
		expect(firstRunMode(3)).toBe('another');
	});
});

describe('installOffer', () => {
	it('offers the Home Screen in a tab on iPadOS and iOS only', () => {
		expect(installOffer('ios-share', false)).toBe('ios-share');
		expect(installOffer('ios-open-in-safari', false)).toBe('ios-open-in-safari');
		expect(installOffer('browser', false)).toBe('none');
		expect(installOffer('none', false)).toBe('none');
	});
	it('never asks again once dismissed', () => {
		expect(installOffer('ios-share', true)).toBe('none');
		expect(installOffer('ios-open-in-safari', true)).toBe('none');
	});
});

describe('firstRunProblems', () => {
	it('finds none in a name and a date', () => {
		expect(firstRunProblems(ok)).toEqual({});
		expect(firstRunProblems({ ...ok, dayNumber: '' })).toEqual({});
		expect(firstRunProblems({ ...ok, name: '  夜の長い旅 🎬  ' })).toEqual({});
	});
	it('asks for a name', () => {
		expect(firstRunProblems({ ...ok, name: '   ' })).toEqual({ name: 'welcome.problem.name' });
	});
	it('asks for a date', () => {
		expect(firstRunProblems({ ...ok, date: '' })).toEqual({ date: 'welcome.problem.date' });
		expect(firstRunProblems({ ...ok, date: '11/11/2026' })).toEqual({ date: 'welcome.problem.date' });
		expect(firstRunProblems({ ...ok, date: '2026-02-31' })).toEqual({ date: 'welcome.problem.date' });
	});
	it('says when a day number would be dropped', () => {
		for (const dayNumber of ['0', '-1', '1.5', 'two', '1e3']) expect(firstRunProblems({ ...ok, dayNumber })).toEqual({ dayNumber: 'welcome.problem.dayNumber' });
		expect(firstRunProblems({ ...ok, dayNumber: ' 12 ' })).toEqual({});
	});
	it('names the first field to fix, in the order of the form', () => {
		expect(firstProblem({ date: 'welcome.problem.date', name: 'welcome.problem.name' })).toBe('name');
		expect(firstProblem({ dayNumber: 'welcome.problem.dayNumber', date: 'welcome.problem.date' })).toBe('date');
		expect(firstProblem({})).toBeUndefined();
	});
});

describe('afterCreate', () => {
	it('lands on the slates of the new project', () => {
		expect(afterCreate(false)).toBe('/slates');
	});
	it('goes by sign-in when asked, and comes back to the slates', () => {
		expect(afterCreate(true)).toBe('/sign-in?next=%2Fslates');
	});
});

describe('draft', () => {
	it('starts today, on day 1', () => {
		expect(draftOf(undefined, '2026-11-11')).toEqual({ name: '', date: '2026-11-11', dayNumber: '1', unit: '', location: '' });
	});
	it('keeps what was typed across a reload', () => {
		const typed = { name: 'Näcken 🎬', date: '2026-11-12', dayNumber: '3', unit: '2nd', location: 'Stage 4' };
		expect(draftOf(parseDraft(serializeDraft(typed)), '2026-11-11')).toEqual(typed);
	});
	it('falls back to today when the kept date is not one', () => {
		expect(draftOf({ name: 'A', date: '' }, '2026-11-11')).toMatchObject({ name: 'A', date: '2026-11-11' });
	});
	it('reads nothing from what is not a draft', () => {
		for (const raw of [null, '', 'x', '[]', '42', '{"name":7}']) expect(draftOf(parseDraft(raw), '2026-11-11').name).toBe('');
	});
});
