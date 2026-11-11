import { describe, expect, it } from 'vitest';
import { input } from '$lib/export/testData';
import { projectInput } from './input';

describe('projectInput', () => {
	it('keeps the records of one project and what hangs under them', () => {
		const ours = input();
		const other = { id: 'p2', name: 'Other' };
		const tables = {
			projects: [ours.project, other],
			shootDays: [...ours.shootDays, { id: 'dx', projectId: 'p2' }],
			lightingSetups: [...ours.lightingSetups, { id: 'lx', projectId: 'p2' }],
			cameraSetups: [...ours.cameraSetups, { id: 'cx', projectId: 'p2' }],
			cameras: [...ours.cameras, { id: 'kx', projectId: 'p2' }],
			lenses: [...ours.lenses, { id: 'nx', projectId: 'p2' }],
			slates: [...ours.slates, { id: 'sx', shootDayId: 'dx' }],
			takes: [...ours.takes, { id: 'tx', slateId: 'sx' }],
			stills: [...ours.stills, { id: 'px', takeId: 'tx', capturedAt: '' }]
		};
		const got = projectInput('p1', tables)!;
		expect(got.project).toBe(ours.project);
		for (const key of ['shootDays', 'lightingSetups', 'cameraSetups', 'cameras', 'lenses', 'slates', 'takes', 'stills'] as const) {
			expect(got[key].map((r) => r.id).sort()).toEqual(ours[key].map((r) => r.id).sort());
		}
	});
	it('is undefined for a project that is not there', () => {
		expect(projectInput('nope', { projects: [], shootDays: [], lightingSetups: [], cameraSetups: [], cameras: [], lenses: [], slates: [], takes: [], stills: [] })).toBeUndefined();
	});
});
