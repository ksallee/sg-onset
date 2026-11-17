import { describe, expect, it } from 'vitest';
import { input } from '$lib/export/testData';
import { projectInput, withMediaKinds } from './input';

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
			stills: [...ours.stills, { id: 'px', takeId: 'tx', capturedAt: '' }],
			references: [...ours.references, { id: 'rx', slateId: 'sx', name: 'Other scan' }]
		};
		const got = projectInput('p1', tables)!;
		expect(got.project).toBe(ours.project);
		for (const key of ['shootDays', 'lightingSetups', 'cameraSetups', 'cameras', 'lenses', 'slates', 'takes', 'stills', 'references'] as const) {
			expect(got[key].map((r) => r.id).sort()).toEqual(ours[key].map((r) => r.id).sort());
		}
	});
	// #89: an audio note is a still whose first file is audio, a video one whose file is video.
	// The exports read each as itself.
	it('holds the audio notes apart from the photos and videos, and names the videos, by their file', () => {
		const ours = input();
		const note = { id: 'an1', takeId: ours.stills[0].takeId, capturedAt: '2026-11-10T22:30:00.000Z' };
		const blobs = [
			{ id: 'b1', recordId: 'st1', type: 'image/jpeg', size: 1, createdAt: 1 },
			{ id: 'b2', recordId: 'st2', type: 'video/quicktime', size: 1, createdAt: 1 },
			{ id: 'ba', recordId: 'an1', type: 'audio/webm', size: 1, createdAt: 2 }
		];
		const got = withMediaKinds({ ...ours, stills: [...ours.stills, note] }, blobs);
		expect(got.stills.map((s) => s.id).sort()).toEqual(['st1', 'st2', 'st3']);
		expect(got.audioNotes).toEqual([note]);
		expect(got.videos).toEqual(['st2']);
	});

	it('is undefined for a project that is not there', () => {
		expect(projectInput('nope', { projects: [], shootDays: [], lightingSetups: [], cameraSetups: [], cameras: [], lenses: [], slates: [], takes: [], stills: [], references: [] })).toBeUndefined();
	});
});
