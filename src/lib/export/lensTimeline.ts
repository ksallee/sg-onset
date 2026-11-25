// The lens timeline of a day (#137): per camera, the takes in the order they started, cut into
// runs of the same lens on the same body. Each run says its lens, its body, its takes, the first
// and last clip name and timecode it has, and the lowest to highest focal length used. Pure.
//
// Kevin, 2026-11-25: a run ends when the lens changes, a zoom's too; a zoom's run shows the
// lowest to highest focal length its takes used.

import type { Camera, Lens } from '$lib/model/types';
import { naturalCompare, type FlatTake } from './selection';

export type LensRun = {
	camera?: Camera;
	lens?: Lens;
	/** The run's takes, in the order they started. Never empty. */
	rows: FlatTake[];
	/** In mm: a prime's own, or the lowest and highest a zoom's takes typed. Absent when none is known. */
	focal?: { min: number; max: number };
	/** The first and last clip name of the run, from the takes that have one. */
	clips?: { first: string; last: string };
	/** The first timecode in and the last timecode out of the run, from the takes that have them. */
	timecode?: { start?: string; end?: string };
};

export type TimelineCamera = { cameraSetupId: string; cameraLetter: string; runs: LensRun[] };

/**
 * Started takes first, by start time; then the takes with no start time, in the order they came
 * (slate, then take). The sort is stable, so equal start times keep that order too.
 */
function byStart(a: FlatTake, b: FlatTake): number {
	const x = a.take.startedAt;
	const y = b.take.startedAt;
	if (x && y) return x.localeCompare(y);
	if (x) return -1;
	if (y) return 1;
	return 0;
}

function focalOf(rows: readonly FlatTake[]): LensRun['focal'] {
	const values = rows.flatMap((r) => (r.focalLength ? [r.focalLength.start, r.focalLength.end] : []));
	return values.length ? { min: Math.min(...values), max: Math.max(...values) } : undefined;
}

function firstLast(values: readonly (string | undefined)[]): { first: string; last: string } | undefined {
	const known = values.filter((v): v is string => !!v);
	return known.length ? { first: known[0], last: known[known.length - 1] } : undefined;
}

function timecodeOf(rows: readonly FlatTake[]): LensRun['timecode'] {
	const start = rows.find((r) => r.take.timecodeStart)?.take.timecodeStart;
	const end = rows.findLast((r) => r.take.timecodeEnd)?.take.timecodeEnd;
	return start || end ? { ...(start ? { start } : {}), ...(end ? { end } : {}) } : undefined;
}

function run(rows: FlatTake[]): LensRun {
	const clips = firstLast(rows.map((r) => r.take.clipName));
	const timecode = timecodeOf(rows);
	const focal = focalOf(rows);
	return { camera: rows[0].camera, lens: rows[0].lens, rows, ...(focal ? { focal } : {}), ...(clips ? { clips } : {}), ...(timecode ? { timecode } : {}) };
}

/** The runs of one camera's takes, already in start order. */
function runsOf(rows: readonly FlatTake[]): LensRun[] {
	const groups: FlatTake[][] = [];
	for (const row of rows) {
		const last = groups.at(-1);
		const same = last && last[0].lens?.id === row.lens?.id && last[0].camera?.id === row.camera?.id;
		if (same) last.push(row);
		else groups.push([row]);
	}
	return groups.map(run);
}

/** The timeline of these takes, cameras in letter order. A take with no camera setup is left out. */
export function lensTimeline(rows: readonly FlatTake[]): TimelineCamera[] {
	const cameras = new Map<string, { letter: string; rows: FlatTake[] }>();
	for (const row of rows) {
		if (!row.cameraSetup) continue;
		const camera = cameras.get(row.cameraSetup.id) ?? { letter: row.cameraLetter, rows: [] };
		camera.rows.push(row);
		cameras.set(row.cameraSetup.id, camera);
	}
	return [...cameras.entries()]
		.sort(([a, x], [b, y]) => naturalCompare(x.letter, y.letter) || a.localeCompare(b))
		.map(([cameraSetupId, c]) => ({ cameraSetupId, cameraLetter: c.letter, runs: runsOf(c.rows.slice().sort(byStart)) }));
}
