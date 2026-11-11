// The takes of a slate as a plain list shows them (the slate page, the Shoot placeholder): in the
// order shot, each with its camera letter and its lens. Pure.

import { effectiveFocalLength } from '$lib/model/take';
import type { CameraSetup, Lens, Take } from '$lib/model/types';

export interface TakeRow {
	take: Take;
	/** The camera letter: A, B. Empty when the take has no setup. */
	camera: string;
	/** The focal length in mm, as "32" or "150–85" for a zoom that moved. Empty when unknown. */
	focal: string;
}

/** In the order shot: by start time, then by take number; takes never started go last. */
export function sortTakes(takes: readonly Take[]): Take[] {
	const collator = new Intl.Collator('en', { numeric: true });
	return [...takes].sort((a, b) => (a.startedAt ?? '￿').localeCompare(b.startedAt ?? '￿') || collator.compare(a.take ?? '', b.take ?? ''));
}

export function takeRows(takes: readonly Take[], setups: readonly CameraSetup[], lenses: readonly Lens[]): TakeRow[] {
	return sortTakes(takes).map((take) => {
		const focal = effectiveFocalLength(
			take,
			lenses.find((l) => l.id === take.lensId)
		);
		return {
			take,
			camera: setups.find((s) => s.id === take.cameraSetupId)?.cameraLabel ?? '',
			focal: !focal ? '' : focal.start === focal.end ? String(focal.start) : `${focal.start}–${focal.end}`
		};
	});
}
