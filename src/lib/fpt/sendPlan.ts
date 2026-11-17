// "Send set data to artists" (#106): which Set Shots and Shots a run covers, and what it did per
// Shot. Pure: the reads and writes are sendSetData.ts, the rules of the links setShots.ts, the Note
// shotNote.ts and notePlan.ts.
//
// A run on Shots covers the Shots selected and the Set Shots that hold them once the code match has
// run. A run on Set Shots covers the Set Shots selected and the Shots they hold after the match. The
// slates are those that link one of those Set Shots (Kevin, #102: links to Shots live on the Set
// Shot, the slate's Shots are derived from them).

import type { NoteOutcome, NoteResult } from './shotNotes';
import type { Resolution } from './schema';
import type { SetShotRow } from './setShots';
import { SHOT, type ShotRow } from './shots';

export type SendKind = 'shot' | 'setShot';

/** The kind of the rows Flow PT sent: Shot, or the site's Set Shot slot. Any other type is not ours. */
export function sendKind(entityType: string, res: Resolution): SendKind | undefined {
	if (entityType === SHOT) return 'shot';
	return res.entities.setShot && entityType === res.entities.setShot ? 'setShot' : undefined;
}

/** The Set Shots of several reads, each once, the later read winning, in id order. */
export function mergeSetShots(...lists: readonly (readonly SetShotRow[])[]): SetShotRow[] {
	const out = new Map<number, SetShotRow>();
	for (const list of lists) for (const s of list) out.set(s.id, s);
	return [...out.values()].sort((a, b) => a.id - b.id);
}

/** The Set Shots and Shots a run covers, after the match. */
export function sendScope(input: { kind: 'shot'; shots: readonly ShotRow[]; setShots: readonly SetShotRow[] } | { kind: 'setShot'; selected: readonly number[]; setShots: readonly SetShotRow[] }): {
	setShots: SetShotRow[];
	shots: ShotRow[];
} {
	if (input.kind === 'shot') {
		const ids = new Set(input.shots.map((s) => s.id));
		return { shots: [...input.shots], setShots: input.setShots.filter((s) => s.shots.some((shot) => ids.has(shot.id))) };
	}
	const selected = new Set(input.selected);
	const setShots = input.setShots.filter((s) => selected.has(s.id));
	const shots = new Map<number, ShotRow>();
	for (const s of setShots) for (const shot of s.shots) if (!shots.has(shot.id)) shots.set(shot.id, shot);
	return { setShots, shots: [...shots.values()].sort((a, b) => a.id - b.id) };
}

/** What a run did about one Shot. */
export type ShotReport = {
	shot: ShotRow;
	/** This run matched a Set Shot to it on its code. */
	linked: boolean;
	/** The Set Shots that hold it. */
	setShots: number;
	/** The slates that reach it through those Set Shots. */
	slates: number;
	/** A write to one of those slates did not land. */
	slatesFailed: boolean;
	/** Its Note; `waits` on a site without the Note fields. */
	note: NoteOutcome | 'waits';
};

const byCode = (a: ShotReport, b: ShotReport) => a.shot.code.localeCompare(b.shot.code, undefined, { numeric: true, sensitivity: 'base' }) || a.shot.id - b.shot.id;

/**
 * Per Shot, from the Set Shots before and after the match, the slates with the Set Shots they link
 * once written, the slates a write of which failed, and the Notes written (undefined: the site
 * lacks the Note fields). A Shot the Notes left out is a Note that failed.
 */
export function shotReports(input: {
	shots: readonly ShotRow[];
	before: readonly SetShotRow[];
	after: readonly SetShotRow[];
	slates: readonly { id: number; setShots: readonly number[] }[];
	failedSlates: ReadonlySet<number>;
	notes: readonly NoteResult[] | undefined;
}): ShotReport[] {
	const was = new Map(input.before.map((s) => [s.id, s]));
	const notes = new Map((input.notes ?? []).map((n) => [n.shot, n.outcome]));
	return input.shots
		.map((shot): ShotReport => {
			const holding = input.after.filter((s) => s.shots.some((x) => x.id === shot.id));
			const holders = new Set(holding.map((s) => s.id));
			const slates = input.slates.filter((slate) => slate.setShots.some((id) => holders.has(id)));
			return {
				shot,
				linked: holding.some((s) => s.matched && was.get(s.id)?.matched === false),
				setShots: holding.length,
				slates: slates.length,
				slatesFailed: slates.some((slate) => input.failedSlates.has(slate.id)),
				note: input.notes === undefined ? 'waits' : (notes.get(shot.id) ?? 'failed')
			};
		})
		.sort(byCode);
}
