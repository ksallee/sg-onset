// What an import of the DIT's clips writes on each matched take (Kevin, #109). An import fills
// empty fields. It also updates a field an earlier import of the day filled, when the take still
// holds what that import wrote: nobody edited it since. It never changes a value a person typed or
// edited; the plan lists those as kept, with the file's value. One patch, so one undo. Pure.

import { change, type Change, type Patch } from '$lib/model/patch';
import { sameValue } from '$lib/model/value';
import type { ClipImport, FieldValue, Take } from '$lib/model/types';
import type { Clip } from './clips';

/** The take fields an import fills, in the order the preview lists them. */
export const CLIP_FIELDS = ['clipName', 'cameraRoll', 'timecodeStart', 'timecodeEnd'] as const;
export type ClipField = (typeof CLIP_FIELDS)[number];

/** add: the field was empty. update: an import filled it and nobody edited it since. kept: a person typed it; left as it is. */
export type FieldPlan = { key: ClipField; kind: 'add' | 'update' | 'kept'; from?: FieldValue; to: string };

/** One matched clip and what it does to its take. `fields` lists only what differs from the file. */
export type TakePlan = { takeId: string; row: number; fields: FieldPlan[] };

export type FillPlan = {
	takes: TakePlan[];
	/** The adds and updates, as one patch on the take table. */
	patch: Patch;
	/** What this import writes, take id to field to value: the entry to keep. */
	filled: Record<string, Partial<Record<ClipField, string>>>;
	/** `takes`: the takes that change. */
	counts: { takes: number; add: number; update: number; kept: number };
};

const empty = (v: unknown) => v === undefined || v === null || v === '';

/** The take fields a clip fills: only those it has. */
export function clipValues(clip: Clip): Partial<Record<ClipField, string>> {
	const values: Partial<Record<ClipField, string>> = { clipName: clip.name };
	if (clip.roll) values.cameraRoll = clip.roll;
	if (clip.start) values.timecodeStart = clip.start;
	if (clip.end) values.timecodeEnd = clip.end;
	return values;
}

/** Per take and field, what the latest of these imports wrote. Order by `importedAt`, ties as given. */
export function lastFilled(imports: readonly ClipImport[]): Map<string, Record<string, FieldValue>> {
	const out = new Map<string, Record<string, FieldValue>>();
	const ordered = imports.map((entry, i) => ({ entry, i })).sort((a, b) => a.entry.importedAt.localeCompare(b.entry.importedAt) || a.i - b.i);
	for (const { entry } of ordered) {
		for (const [takeId, fields] of Object.entries(entry.filled)) out.set(takeId, { ...out.get(takeId), ...fields });
	}
	return out;
}

/** `filled`: `lastFilled` of the day's earlier imports. */
export function planFill(pairs: readonly { clip: Clip; take: Take }[], filled: ReadonlyMap<string, Record<string, FieldValue>>): FillPlan {
	const takes: TakePlan[] = [];
	const patch: Change[] = [];
	const written: FillPlan['filled'] = {};
	const counts = { takes: 0, add: 0, update: 0, kept: 0 };
	for (const { clip, take } of pairs) {
		const values = clipValues(clip);
		const before = filled.get(take.id) ?? {};
		const fields: FieldPlan[] = [];
		for (const key of CLIP_FIELDS) {
			const to = values[key];
			if (to === undefined) continue;
			const now = (take as Record<string, unknown>)[key] as FieldValue | undefined;
			if (!empty(now) && sameValue(now, to)) continue;
			if (empty(now)) fields.push({ key, kind: 'add', to });
			else if (key in before && sameValue(now, before[key])) fields.push({ key, kind: 'update', from: now, to });
			else fields.push({ key, kind: 'kept', from: now, to });
		}
		let changed = false;
		for (const f of fields) {
			counts[f.kind]++;
			if (f.kind === 'kept') continue;
			patch.push(change(take, f.key, f.to));
			(written[take.id] ??= {})[f.key] = f.to;
			changed = true;
		}
		if (changed) counts.takes++;
		takes.push({ takeId: take.id, row: clip.row, fields });
	}
	return { takes, patch, filled: written, counts };
}

/** The entry that keeps what an import wrote. */
export function clipImportRecord(plan: FillPlan, at: { id: string; shootDayId: string; importedAt: string; fileName?: string }): ClipImport {
	return { id: at.id, shootDayId: at.shootDayId, importedAt: at.importedAt, ...(at.fileName ? { fileName: at.fileName } : {}), filled: plan.filled };
}
