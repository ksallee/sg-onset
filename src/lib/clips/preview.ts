// What an import of the DIT's clips will do, before anything is saved: the file as a table, the
// columns read, the clips, the take of each and how it was found, and what each fills, updates or
// keeps. One pure function of the file, the person's column map and picks, and the day. The page
// shows it and applies its plan.

import type { ClipImport, Slate, Take } from '$lib/model/types';
import { readClips, type Clip, type ClipRead } from './clips';
import { autoMap, type ColumnMap } from './columns';
import { matchClips, matchCounts, withPicks, type Match, type Pick } from './match';
import { lastFilled, planFill, type FieldPlan, type FillPlan } from './plan';
import { readSheet, type Sheet } from './sheet';

/** A take of the day, with its slate and camera letter, as `slates/takes.ts` `dayTakeLines` gives them. */
export type DayLine = { take: Take; slate: Slate; camera: string };

export type PreviewInput = {
	text: string;
	/** The columns as the person mapped them. Absent: known by name. */
	map?: ColumnMap;
	picks: readonly Pick[];
	/** The day's takes in the day's order. */
	lines: readonly DayLine[];
	/** The day's earlier imports. */
	imports: readonly ClipImport[];
	/** Minutes east of UTC at a timestamp: the device's time zone. */
	offsetMinutes: (timestamp: string) => number;
};

/** One clip: its take, if matched, and what the import does there. */
export type PreviewRow = { clip: Clip; match: Match; line?: DayLine; fields: FieldPlan[] };

export type ClipPreview = {
	sheet: Sheet | null;
	map: ColumnMap;
	read: ClipRead;
	matches: Match[];
	counts: ReturnType<typeof matchCounts>;
	rows: PreviewRow[];
	plan: FillPlan;
};

export function previewClips(input: PreviewInput): ClipPreview {
	const sheet = readSheet(input.text);
	const map = input.map ?? (sheet ? autoMap(sheet.headers) : {});
	const read: ClipRead = sheet ? readClips(sheet, map) : { clips: [], issues: [] };
	const takes = input.lines.map((l) => ({ id: l.take.id, camera: l.camera || undefined, startedAt: l.take.startedAt, endedAt: l.take.endedAt }));
	const matches = withPicks(matchClips(read.clips, takes, { offsetMinutes: input.offsetMinutes }), input.picks);
	const byTake = new Map(input.lines.map((l) => [l.take.id, l]));
	const byRow = new Map(read.clips.map((c) => [c.row, c]));
	const pairs = matches.flatMap((m) => {
		const line = m.takeId ? byTake.get(m.takeId) : undefined;
		return line ? [{ clip: byRow.get(m.row)!, take: line.take }] : [];
	});
	const plan = planFill(pairs, lastFilled(input.imports));
	const fields = new Map(plan.takes.map((p) => [p.row, p.fields]));
	const rows = matches.map((match) => ({
		clip: byRow.get(match.row)!,
		match,
		...(match.takeId && byTake.has(match.takeId) ? { line: byTake.get(match.takeId) } : {}),
		fields: fields.get(match.row) ?? []
	}));
	return { sheet, map, read, matches, counts: matchCounts(matches), rows, plan };
}
