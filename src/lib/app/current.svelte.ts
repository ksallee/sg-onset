// The place the person is working in, live: the projects, the current project, its shoot days,
// the current day, its slates, the current slate. The pick is kept in the settings (`last`); a
// project or a day that is gone falls back to the first of its list, a slate never does.
// `provideCurrent()` in the app layout, `useCurrent()` in any page under it.
import { getContext, setContext } from 'svelte';
import type { Project, ShootDay, Slate } from '$lib/model/types';
import { pickCurrent, pickExact, sortProjects, sortShootDays, sortSlates } from './context';
import { liveList } from './live.svelte';
import type { Last } from './settings';
import { settings } from './settings.svelte';

export interface Current {
	/** Every project, by name. */
	readonly projects: Project[];
	readonly project: Project | undefined;
	/** The shoot days of the current project, newest first. */
	readonly shootDays: ShootDay[];
	readonly shootDay: ShootDay | undefined;
	/** The slates of the current day, in counting order. */
	readonly slates: Slate[];
	/** The slate being shot, if one was picked. */
	readonly slate: Slate | undefined;
	/** The projects have been read: only then does an empty list mean a first run. */
	readonly ready: boolean;
	/** Moves to a project, a shoot day or a slate. It is remembered on this device. */
	select(place: Last): void;
}

const KEY = Symbol('sg-onset-current');

export function provideCurrent(): Current {
	const projectRows = liveList('project');
	const projects = $derived(sortProjects(projectRows.value));
	const project = $derived(pickCurrent(projects, settings.value.last.projectId));
	const dayRows = liveList('shootDay', () => project?.id);
	const shootDays = $derived(sortShootDays(dayRows.value));
	const shootDay = $derived(pickCurrent(shootDays, settings.value.last.shootDayId));
	const slateRows = liveList('slate', () => shootDay?.id);
	const slates = $derived(sortSlates(slateRows.value));
	const slate = $derived(pickExact(slates, settings.value.last.slateId));

	const current: Current = {
		get projects() {
			return projects;
		},
		get project() {
			return project;
		},
		get shootDays() {
			return shootDays;
		},
		get shootDay() {
			return shootDay;
		},
		get slates() {
			return slates;
		},
		get slate() {
			return slate;
		},
		get ready() {
			return projectRows.ready;
		},
		select: (place) => settings.place(place)
	};
	setContext(KEY, current);
	return current;
}

export function useCurrent(): Current {
	const current = getContext<Current | undefined>(KEY);
	if (!current) throw new Error('useCurrent: no place in context. It is provided by the app layout.');
	return current;
}
