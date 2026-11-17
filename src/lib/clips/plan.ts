// What an import of the DIT's clips writes on each matched take (Kevin, #109). An import fills
// empty fields. It also updates a field an earlier import of the day filled, when the take still
// holds what that import wrote: nobody edited it since. It never changes a value a person typed or
// edited, and a field a person cleared after an import counts as edited: it stays empty. The plan
// lists those as kept, with the file's value. One patch, so one undo. Pure.
//
// The fields: clip name, camera roll, timecode in and out; the lens, found in the gear by its name
// (lens.ts), never created; a zoom's focal length; T-stop, ISO, white balance, shutter angle and
// frame rate.

import { change, type Change, type Patch } from '$lib/model/patch';
import { isZoom } from '$lib/model/take';
import { sameValue } from '$lib/model/value';
import type { ClipImport, FieldValue, Lens, Take } from '$lib/model/types';
import type { Clip } from './clips';
import { matchLens, type LensMatch } from './lens';

/** The take fields an import fills, in the order the preview lists them. */
export const CLIP_FIELDS = ['clipName', 'cameraRoll', 'timecodeStart', 'timecodeEnd', 'lensId', 'focalLength', 'tStop', 'isoSpeed', 'whiteBalance', 'shutterAngle', 'captureFrameRate'] as const;
export type ClipField = (typeof CLIP_FIELDS)[number];

/**
 * add: the field was empty. update: an import filled it and nobody edited it since. kept: a person
 * typed or edited it, and `from` is what it holds; with no `from`, a person cleared what an import
 * filled. Left as it is.
 */
export type FieldPlan = { key: ClipField; kind: 'add' | 'update' | 'kept'; from?: FieldValue; to: FieldValue };

/** One matched clip and what it does to its take. `fields` lists only what differs from the file. */
export type TakePlan = {
	takeId: string;
	row: number;
	fields: FieldPlan[];
	/** The lens the file names, and what it matched in the gear. */
	lens?: { name: string; match: LensMatch };
};

/** Per take, per field, what an import wrote. */
export type Filled = Record<string, Partial<Record<ClipField, FieldValue>>>;

export type FillPlan = {
	takes: TakePlan[];
	/** The adds and updates, as one patch on the take table. */
	patch: Patch;
	/** What this import writes: the entry to keep. */
	filled: Filled;
	/** `takes`: the takes that change. */
	counts: { takes: number; add: number; update: number; kept: number };
};

const empty = (v: unknown) => v === undefined || v === null || v === '';

/** The take fields a clip fills, the lens and the focal length aside: only those it has. */
export function clipValues(clip: Clip): Partial<Record<ClipField, FieldValue>> {
	const values: Partial<Record<ClipField, FieldValue>> = { clipName: clip.name };
	if (clip.roll) values.cameraRoll = clip.roll;
	if (clip.start) values.timecodeStart = clip.start;
	if (clip.end) values.timecodeEnd = clip.end;
	for (const key of ['tStop', 'isoSpeed', 'whiteBalance', 'shutterAngle', 'captureFrameRate'] as const) {
		if (clip[key] !== undefined) values[key] = clip[key];
	}
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

/** What the import does to one field: nothing, or its plan. `before`: what imports wrote there. */
function planField(key: ClipField, now: unknown, to: FieldValue, before: Readonly<Partial<Record<string, FieldValue>>>): FieldPlan | undefined {
	const filled = key in before;
	if (empty(now)) return filled ? { key, kind: 'kept', to } : { key, kind: 'add', to };
	if (sameValue(now, to)) return undefined;
	if (filled && sameValue(now, before[key])) return { key, kind: 'update', from: now as FieldValue, to };
	return { key, kind: 'kept', from: now as FieldValue, to };
}

/** `filled`: `lastFilled` of the day's earlier imports. `lenses`: the project's, to find a clip's lens in. */
export function planFill(pairs: readonly { clip: Clip; take: Take }[], filled: ReadonlyMap<string, Readonly<Partial<Record<string, FieldValue>>>>, lenses: readonly Lens[] = []): FillPlan {
	const takes: TakePlan[] = [];
	const patch: Change[] = [];
	const written: Filled = {};
	const counts = { takes: 0, add: 0, update: 0, kept: 0 };
	for (const { clip, take } of pairs) {
		const before = filled.get(take.id) ?? {};
		const values = clipValues(clip);
		const plan: TakePlan = { takeId: take.id, row: clip.row, fields: [] };
		if (clip.lens) {
			const match = matchLens(clip.lens, lenses);
			plan.lens = { name: clip.lens, match };
			if (match.kind === 'one') values.lensId = match.lens.id;
		}
		const now = (key: ClipField) => (take as Record<string, unknown>)[key];
		const fieldOf = (key: ClipField) => (values[key] === undefined ? undefined : planField(key, now(key), values[key]!, before));

		const lensPlan = fieldOf('lensId');
		// The take's lens once imported: a zoom's focal length is the take's own; a prime's is the lens's.
		const lensId = lensPlan && lensPlan.kind !== 'kept' ? (lensPlan.to as string) : (now('lensId') as string | undefined);
		const lens = lenses.find((l) => l.id === lensId);
		if (clip.focalLength !== undefined && lens && isZoom(lens)) values.focalLength = clip.focalLength;

		for (const key of CLIP_FIELDS) {
			const f = key === 'lensId' ? lensPlan : fieldOf(key);
			if (f) plan.fields.push(f);
		}
		let changed = false;
		for (const f of plan.fields) {
			counts[f.kind]++;
			if (f.kind === 'kept') continue;
			patch.push(change(take, f.key, f.to));
			(written[take.id] ??= {})[f.key] = f.to;
			changed = true;
		}
		if (changed) counts.takes++;
		takes.push(plan);
	}
	return { takes, patch, filled: written, counts };
}

/** The entry that keeps what an import wrote. */
export function clipImportRecord(plan: FillPlan, at: { id: string; shootDayId: string; importedAt: string; fileName?: string }): ClipImport {
	return { id: at.id, shootDayId: at.shootDayId, importedAt: at.importedAt, ...(at.fileName ? { fileName: at.fileName } : {}), filled: plan.filled as ClipImport['filled'] };
}
