import { describe, expect, it } from 'vitest';
import { validateRecord } from '$lib/model/validate';
import { firstRun, firstRunProblem, nextShootDay } from './records';

const ids = () => {
	let n = 0;
	return () => `id${++n}`;
};

describe('firstRunProblem', () => {
	it('wants a name and a date', () => {
		expect(firstRunProblem({ name: '  ', date: '2026-11-11' })).toBe('validation.required');
		expect(firstRunProblem({ name: 'Show', date: '' })).toBe('validation.date');
		expect(firstRunProblem({ name: 'Show', date: '2026-11-11' })).toBeUndefined();
	});
});

describe('firstRun', () => {
	it('makes a project and its first day, trimmed', () => {
		const { project, shootDay } = firstRun({ name: ' The Show ', date: '2026-11-11', dayNumber: '1', unit: ' Main ', location: 'Stage 4' }, ids());
		expect(project).toEqual({ id: 'id1', name: 'The Show' });
		expect(shootDay).toEqual({ id: 'id2', projectId: 'id1', shootDate: '2026-11-11', shootDay: 1, cameraUnit: 'Main', location: 'Stage 4' });
		expect(validateRecord('project', project)).toEqual({});
		expect(validateRecord('shootDay', shootDay)).toEqual({});
	});
	it('leaves out what was not typed, and a day number that is not one', () => {
		expect(firstRun({ name: 'Show', date: '2026-11-11', dayNumber: 'two', unit: ' ' }, ids()).shootDay).toEqual({ id: 'id2', projectId: 'id1', shootDate: '2026-11-11' });
		expect(firstRun({ name: 'Show', date: '2026-11-11', dayNumber: '0' }, ids()).shootDay.shootDay).toBeUndefined();
	});
});

describe('nextShootDay', () => {
	it('numbers after the last and carries the unit and the location of the newest day', () => {
		const days = [
			{ id: 'a', projectId: 'p', shootDate: '2026-11-09', shootDay: 1, cameraUnit: 'Main', location: 'Stage 4' },
			{ id: 'b', projectId: 'p', shootDate: '2026-11-10', shootDay: 2, cameraUnit: 'Second', location: 'Harbour' }
		];
		expect(nextShootDay('p', days, '2026-11-11', ids())).toEqual({ id: 'id1', projectId: 'p', shootDate: '2026-11-11', shootDay: 3, cameraUnit: 'Second', location: 'Harbour' });
	});
	it('starts at day 1 with nothing to carry', () => {
		expect(nextShootDay('p', [], '2026-11-11', ids())).toEqual({ id: 'id1', projectId: 'p', shootDate: '2026-11-11', shootDay: 1 });
	});
});
