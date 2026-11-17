// The records of one project out of whole tables, as the export modules read them. Pure.

import type { ExportInput } from '$lib/export/selection';
import { firstBlobs, type PhotoBlob } from '$lib/export/wrapPackage';
import { isAudio } from '$lib/media/audioFormat';
import type { Camera, CameraSetup, Lens, LightingSetup, Project, Reference, ShootDay, Slate, Still, Take } from '$lib/model/types';

export type AllTables = {
	projects: Project[];
	shootDays: ShootDay[];
	lightingSetups: LightingSetup[];
	cameraSetups: CameraSetup[];
	cameras: Camera[];
	lenses: Lens[];
	slates: Slate[];
	takes: Take[];
	stills: Still[];
	references: Reference[];
};

export function projectInput(projectId: string, all: AllTables): ExportInput | undefined {
	const project = all.projects.find((p) => p.id === projectId);
	if (!project) return undefined;
	const mine = <T extends { projectId?: string }>(rows: T[]) => rows.filter((r) => r.projectId === projectId);
	const shootDays = mine(all.shootDays);
	const dayIds = new Set(shootDays.map((d) => d.id));
	const slates = all.slates.filter((s) => dayIds.has(s.shootDayId));
	const slateIds = new Set(slates.map((s) => s.id));
	const takes = all.takes.filter((t) => slateIds.has(t.slateId));
	const takeIds = new Set(takes.map((t) => t.id));
	return {
		project,
		shootDays,
		lightingSetups: mine(all.lightingSetups),
		cameraSetups: mine(all.cameraSetups),
		cameras: mine(all.cameras),
		lenses: mine(all.lenses),
		slates,
		takes,
		stills: all.stills.filter((s) => takeIds.has(s.takeId)),
		references: all.references.filter((r) => slateIds.has(r.slateId))
	};
}

/**
 * The input with its audio notes (#89) held apart from the photos and videos: a still whose first
 * stored file is audio. The camera report counts photos, the wrap package names each its own way.
 * `blobs`: the stills' files, as `store.blobsOf` gives them.
 */
export function withAudioNotes(input: ExportInput, blobs: readonly PhotoBlob[]): ExportInput {
	const first = firstBlobs(blobs);
	const audio = (id: string) => isAudio(first.get(id)?.type ?? '');
	return { ...input, stills: input.stills.filter((s) => !audio(s.id)), audioNotes: input.stills.filter((s) => audio(s.id)) };
}
