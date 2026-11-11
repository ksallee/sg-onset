// What the shell does to the store beyond one edit: the first run, a new shoot day, the sample
// project. Each goes through the editor, so it is saved, queued and undoable as one entry.

import type { ShootDay } from '$lib/model/types';
import type { App } from './app.svelte';
import { today } from './format';
import { firstRun, nextShootDay, type FirstRun } from './records';
import { sampleProject, sampleRows } from './sample';

/** Makes a project and its first shoot day. Returns their ids. */
export async function createFirstRun(app: App, input: FirstRun): Promise<{ projectId: string; shootDayId: string }> {
	const { project, shootDay } = firstRun(input, app.newId);
	await app.edit.group({ key: 'edit.created', params: { what: project.name ?? '' } }, async () => {
		await app.edit.create('project', project);
		await app.edit.create('shootDay', shootDay);
	});
	return { projectId: project.id, shootDayId: shootDay.id };
}

/** Starts a shoot day today. Returns it. */
export async function createShootDay(app: App, projectId: string, days: readonly ShootDay[], what: string): Promise<ShootDay> {
	const day = nextShootDay(projectId, days, today(new Date(app.now())), app.newId);
	await app.edit.create('shootDay', day, { label: { key: 'edit.created', params: { what } } });
	return day;
}

/** Writes the sample project. Returns the place to go to: the project, its newest day and that day's first slate. */
export async function loadSample(app: App): Promise<{ projectId: string; shootDayId: string; slateId?: string }> {
	const sample = sampleProject({ newId: app.newId, now: new Date(app.now()) });
	await app.edit.group({ key: 'edit.sample' }, async () => {
		for (const { table, row } of sampleRows(sample)) await app.edit.create(table, row);
	});
	const day = sample.shootDays[sample.shootDays.length - 1];
	return { projectId: sample.project.id, shootDayId: day.id, slateId: sample.slates.find((s) => s.shootDayId === day.id)?.id };
}

/** Deletes the sample project and everything under it. Nothing of it stays queued if it was never sent. */
export async function removeSample(app: App, projectId: string): Promise<void> {
	await app.edit.removeTree('project', projectId, { key: 'edit.sample.removed' });
}
