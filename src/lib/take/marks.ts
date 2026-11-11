// Circle, no good, the note and photos of a take number. Marks and the note are on the take, not
// on one camera: they are written to every camera's record of it. A photo goes on one camera's
// take: the camera picked on screen. Pure.

import { change, type Patch } from '$lib/model/patch';
import type { Still, Take } from '$lib/model/types';
import type { TakeGroup } from './groups';
import { stamp } from './phase';

export type Mark = 'circleTake' | 'noGood';

const OTHER: Record<Mark, Mark> = { circleTake: 'noGood', noGood: 'circleTake' };

/** Sets or clears a mark on every camera. A circled take is not no good, and the other way round. */
export function markPatch(group: TakeGroup, mark: Mark, on: boolean): Patch {
	const patch = [];
	for (const take of group.takes) {
		if ((take[mark] === true) !== on) patch.push(change(take, mark, on ? true : undefined));
		if (on && take[OTHER[mark]] !== undefined) patch.push(change(take, OTHER[mark], undefined));
	}
	return patch;
}

/** On when every camera has it. */
export function groupMark(group: TakeGroup, mark: Mark): boolean {
	return group.takes.length > 0 && group.takes.every((t) => t[mark] === true);
}

/** The note on every camera, trimmed; empty clears it. */
export function notePatch(group: TakeGroup, text: string): Patch {
	const note = text.trim() || undefined;
	return group.takes.filter((t) => t.notes !== note).map((t) => change(t, 'notes', note));
}

export function groupNote(group: TakeGroup): string {
	return group.takes.find((t) => t.notes)?.notes ?? '';
}

/** The take a photo goes on: the picked camera's, else the first camera's. */
export function photoTake(group: TakeGroup | undefined, setupId: string): Take | undefined {
	if (!group) return undefined;
	return group.bySetup[setupId] ?? group.takes[0];
}

/** A still record for a photo taken at `at`. The file is stored with it, under its id. */
export function newStill(takeId: string, id: string, at: number): Still {
	return { id, takeId, capturedAt: stamp(at) };
}
