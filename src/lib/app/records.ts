// New records as the app makes them: a project with its first shoot day, another shoot day.
// Pure: ids are passed in. What is typed is trimmed; an empty optional field is left out.

import type { Project, ShootDay } from '$lib/model/types';
import { nextDayNumber } from './context';

const text = (v: string | undefined): string | undefined => (v && v.trim() !== '' ? v.trim() : undefined);
const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export interface FirstRun {
	name: string;
	/** YYYY-MM-DD. */
	date: string;
	/** The day number, as typed. Not a whole number of 1 or more: left out. */
	dayNumber?: string;
	unit?: string;
	location?: string;
}

/** What stops a first run: the message key of the first problem, or nothing. */
export function firstRunProblem(input: FirstRun): 'validation.required' | 'validation.date' | undefined {
	if (!text(input.name)) return 'validation.required';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'validation.date';
	return undefined;
}

export function firstRun(input: FirstRun, newId: () => string): { project: Project; shootDay: ShootDay } {
	const project: Project = { id: newId(), name: input.name.trim() };
	const n = Number(input.dayNumber);
	const shootDay: ShootDay = compact({
		id: newId(),
		projectId: project.id,
		shootDate: input.date,
		shootDay: Number.isInteger(n) && n >= 1 ? n : undefined,
		cameraUnit: text(input.unit),
		location: text(input.location)
	});
	return { project, shootDay };
}

/** The next shoot day of a project: on `date`, numbered after the last, on the unit and at the location of the newest day. */
export function nextShootDay(projectId: string, days: readonly ShootDay[], date: string, newId: () => string): ShootDay {
	const newest = [...days].sort((a, b) => (b.shootDate ?? '').localeCompare(a.shootDate ?? ''))[0];
	return compact({ id: newId(), projectId, shootDate: date, shootDay: nextDayNumber(days), cameraUnit: newest?.cameraUnit, location: newest?.location });
}
