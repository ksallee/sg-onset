// The Note on a Shot (#97): what was captured for it, built from the records as Flow PT holds them,
// never from the device. The sync uses it, and so will the Action Menu Item of #106, run from a
// desktop with no data on it. One module for the text: the records, what the Note lists, its
// subject and body, what a later sync added, and the reply that says so. Pure: the reads and the
// writes are in shotNotes.ts, what to write in notePlan.ts.
//
// A Shot's slates are those whose Set Shots hold it (Kevin, #102: links to Shots live on the Set
// Shot; the slate's own Shots field is derived from them). Its takes, references and photos are
// those of its slates. The element takes come first, by type, with the plates at the tail of a
// take (model/takeElements.ts): artists rebuild these when they do not know they exist. Then the
// takes by slate, the references, the photo count.
//
// What the Note lists is also kept as ids, beside it on the Note (`NOTE_CAPTURED`): a take number
// of a slate, an element take, a reference, a photo. The next sync compares the two lists to tell
// nothing new from something added, with no memory on the device.
//
// From the corpus:
// - A link reads `{id, name, type}` under `relationships` (field_types/entity.md, multi_entity.md).
// - A photo is an Attachment in the take's photos field; its file name, which the upload set and
//   nothing changes, says which photo it is and whether it is the annotated copy (stills.ts,
//   entity_types/Attachment.md).

import { takeElements, type ElementType } from '$lib/model/takeElements';
import type { Take } from '$lib/model/types';
import { isBuiltInKind, kindLabel, KINDS } from '$lib/references/kinds';
import { fieldMap, SET_SHOT_SHOTS, SET_SHOTS, STILLS, type EntityScope } from './mapping';
import { fromRow, type Row } from './payload';
import { fieldName, type Resolution } from './schema';
import { linkIdsOf } from './setShots';
import { variantOf } from './stills';

/** A row as a `_search` answers it. The type is not read. */
export type NoteRow = Omit<Row, 'type'> & { type?: string };

/** A Set Shot: the Shots it holds. */
export type NoteSetShot = { id: number; shots: number[] };
/** A slate: its code and the Set Shots it links. */
export type NoteSlate = { id: number; code: string; setShots: number[] };
/** A take: its slate, its number, what it is for, what it caught at its tail, its photos. */
export type NoteTake = { id: number; slate: number; take: string; takeType?: string; takeTail?: string[]; photos: number[] };
/** A set reference: the slates it links, its kind and its name. */
export type NoteReference = { id: number; slates: number[]; kind: string; name: string };
/** An Attachment of a take's photos field: its file name. */
export type NoteFile = { id: number; filename: string };

/** What the Note on a Shot is built from, as Flow PT holds it. */
export type NoteRecords = { setShots: NoteSetShot[]; slates: NoteSlate[]; takes: NoteTake[]; references: NoteReference[]; files: NoteFile[] };

/** A label from the message catalogue. The Note is in English. */
export type Label = (key: string, params?: Record<string, string | number>) => string;

const column = (scope: EntityScope, key: string) => fieldMap(scope, key)!.columns[0];
const named = (res: Resolution, scope: EntityScope, key: string) => fieldName(res, scope, column(scope, key));

/**
 * The fields to ask each type for, by their names on the site. `referenceLinks`: the fields that
 * link a set reference to its slates. A reference that shows on every slate of its lighting setup
 * (#107) adds its own field here.
 */
export function noteReads(res: Resolution): {
	setShot: string[];
	slate: string[];
	take: string[];
	reference: string[];
	file: string[];
	/** The link fields searched on: a Set Shot's Shots, a slate's Set Shots, a take's slate and photos, a reference's slates. */
	links: { setShotShots: string; slateSetShots: string; takeSlate: string; takePhotos: string; referenceSlates: string[] };
} {
	const links = {
		setShotShots: fieldName(res, 'setShot', SET_SHOT_SHOTS),
		slateSetShots: fieldName(res, 'slate', SET_SHOTS),
		takeSlate: named(res, 'take', 'slateId'),
		takePhotos: fieldName(res, 'take', STILLS),
		referenceSlates: [named(res, 'reference', 'slateId')]
	};
	return {
		setShot: [links.setShotShots],
		slate: [named(res, 'slate', 'slateUID'), links.slateSetShots],
		take: [named(res, 'take', 'take'), named(res, 'take', 'takeType'), named(res, 'take', 'takeTail'), links.takeSlate, links.takePhotos],
		reference: [named(res, 'reference', 'name'), named(res, 'reference', 'kind'), ...links.referenceSlates],
		file: ['filename'],
		links
	};
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The ids a link field holds: an entity field's one, or a multi-entity's every one (field_types/entity.md). */
const linked = (row: NoteRow, field: string): number[] => {
	const data = row.relationships?.[field]?.data;
	return linkIdsOf({ id: row.id, relationships: { [field]: { data: Array.isArray(data) ? data : data ? [data] : [] } } }, field);
};

/** The records out of the rows of each search. */
export function noteRecordsOf(
	res: Resolution,
	rows: { setShots: readonly NoteRow[]; slates: readonly NoteRow[]; takes: readonly NoteRow[]; references: readonly NoteRow[]; files: readonly NoteRow[] },
	referenceLinks: readonly string[] = noteReads(res).links.referenceSlates
): NoteRecords {
	const values = (scope: EntityScope, row: NoteRow, keys: string[]) => fromRow(res, scope, { type: '', ...row }, keys);
	return {
		setShots: rows.setShots.map((row) => ({ id: row.id, shots: linkIdsOf(row, fieldName(res, 'setShot', SET_SHOT_SHOTS)) })),
		slates: rows.slates.map((row) => ({ id: row.id, code: text(values('slate', row, ['slateUID']).slateUID), setShots: linkIdsOf(row, fieldName(res, 'slate', SET_SHOTS)) })),
		takes: rows.takes.flatMap((row) => {
			const [slate] = linked(row, named(res, 'take', 'slateId'));
			if (slate === undefined) return [];
			const v = values('take', row, ['take', 'takeType', 'takeTail']);
			return [
				{
					id: row.id,
					slate,
					take: text(v.take),
					...(typeof v.takeType === 'string' ? { takeType: v.takeType } : {}),
					...(Array.isArray(v.takeTail) ? { takeTail: v.takeTail as string[] } : {}),
					photos: linkIdsOf(row, fieldName(res, 'take', STILLS))
				}
			];
		}),
		references: rows.references.map((row) => {
			const v = values('reference', row, ['name', 'kind']);
			return { id: row.id, slates: [...new Set(referenceLinks.flatMap((field) => linked(row, field)))], kind: text(v.kind), name: text(v.name) };
		}),
		files: rows.files.map((row) => ({ id: row.id, filename: text(row.attributes?.filename) }))
	};
}

/** One take number of one slate. */
type SlateTake = { slate: string; take: string };

/** What was captured for one Shot, and what the Note lists as ids. */
export type ShotCapture = {
	shot: { id: number; code: string };
	/** The slates with takes, in order, each with its take numbers in order. */
	slates: { slate: string; takes: string[] }[];
	/** The element takes: by type in the catalogue's order, those typed so, then those with the plate at the tail. */
	elements: { type: ElementType; tail: boolean; takes: SlateTake[] }[];
	/** The references by kind: the built-in kinds in their order, then the others, Other last. */
	references: { kind: string; names: string[] }[];
	photos: number;
	/** What the Note lists, as ids, each once, sorted. */
	items: string[];
};

/** What a capture is made of, each part with its id. */
export type CaptureEntry =
	| { part: 'take'; item: string; slate: string; take: string }
	| { part: 'element'; item: string; type: ElementType; tail: boolean; slate: string; take: string }
	| { part: 'reference'; item: string; kind: string; name: string }
	| { part: 'photo'; item: string };

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
// A take number is typed: spaces and colons are spelled out, so one id is one word.
const safe = (take: string) => encodeURIComponent(take);

/** Every part captured for a Shot: its slates are those whose Set Shots hold it. */
function entriesOf(shotId: number, records: NoteRecords): CaptureEntry[] {
	const sets = new Set(records.setShots.filter((s) => s.shots.includes(shotId)).map((s) => s.id));
	const slates = new Map(records.slates.filter((s) => s.setShots.some((id) => sets.has(id))).map((s) => [s.id, s.code]));
	const takes = records.takes
		.filter((t) => slates.has(t.slate) && t.take !== '')
		.sort((a, b) => natural(slates.get(a.slate)!, slates.get(b.slate)!) || natural(a.take, b.take) || a.id - b.id);
	const out: CaptureEntry[] = takes.map((t) => ({ part: 'take', item: `take:${t.slate}:${safe(t.take)}`, slate: slates.get(t.slate)!, take: t.take }));

	const byId = new Map(takes.map((t) => [String(t.id), t]));
	const asTakes: Take[] = takes.map((t) => ({ id: String(t.id), slateId: String(t.slate), take: t.take, takeType: t.takeType, takeTail: t.takeTail }));
	for (const { type, takes: listed } of takeElements(asTakes)) {
		for (const tail of [false, true]) {
			for (const { take } of listed.filter((e) => e.tail === tail)) {
				const t = byId.get(take.id)!;
				out.push({ part: 'element', item: `${type}${tail ? '.tail' : ''}:${t.slate}:${safe(t.take)}`, type, tail, slate: slates.get(t.slate)!, take: t.take });
			}
		}
	}

	for (const r of records.references) {
		if (r.name !== '' && r.slates.some((id) => slates.has(id))) out.push({ part: 'reference', item: `reference:${r.id}`, kind: r.kind, name: r.name });
	}

	// A photo once: its annotated copy is the same photo, and a photo sent twice is one (stills.ts).
	const files = new Map(records.files.map((f) => [f.id, f.filename]));
	const photos = new Map<string, number>();
	for (const id of takes.flatMap((t) => t.photos)) {
		const name = files.get(id);
		if (name === undefined || variantOf(name)) continue;
		const ours = /^onset_([a-z0-9-]+)_/i.exec(name);
		const key = ours ? `still:${ours[1].toLowerCase()}` : `file:${id}`;
		photos.set(key, Math.min(photos.get(key) ?? id, id));
	}
	for (const id of photos.values()) out.push({ part: 'photo', item: `photo:${id}` });
	return out;
}

const kindRank = (kind: string) => (kind === '' || kind === 'other' ? KINDS.length : isBuiltInKind(kind) ? KINDS.indexOf(kind) : KINDS.length - 1);

/** The capture of a list of parts: grouped, each group in order, each id once. */
function captureOf(shot: { id: number; code: string }, entries: readonly CaptureEntry[]): ShotCapture {
	const slates: ShotCapture['slates'] = [];
	const elements: ShotCapture['elements'] = [];
	const references: ShotCapture['references'] = [];
	for (const e of entries) {
		if (e.part === 'take') {
			const at = slates.find((s) => s.slate === e.slate) ?? slates[slates.push({ slate: e.slate, takes: [] }) - 1];
			if (!at.takes.includes(e.take)) at.takes.push(e.take);
		} else if (e.part === 'element') {
			const at = elements.find((g) => g.type === e.type && g.tail === e.tail) ?? elements[elements.push({ type: e.type, tail: e.tail, takes: [] }) - 1];
			if (!at.takes.some((t) => t.slate === e.slate && t.take === e.take)) at.takes.push({ slate: e.slate, take: e.take });
		} else if (e.part === 'reference') {
			const kind = e.kind || 'other';
			const at = references.find((g) => g.kind === kind) ?? references[references.push({ kind, names: [] }) - 1];
			if (!at.names.includes(e.name)) at.names.push(e.name);
		}
	}
	for (const g of references) g.names.sort(natural);
	references.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || natural(a.kind, b.kind));
	return {
		shot,
		slates,
		elements,
		references,
		photos: entries.filter((e) => e.part === 'photo').length,
		items: [...new Set(entries.map((e) => e.item))].sort()
	};
}

/** What was captured for a Shot, from the records as Flow PT holds them. */
export function shotCapture(shot: { id: number; code: string }, records: NoteRecords): ShotCapture & { entries: readonly CaptureEntry[] } {
	const entries = entriesOf(shot.id, records);
	return { ...captureOf(shot, entries), entries };
}

/** What the capture holds that `before`, the ids the Note listed, does not. What it listed that is gone is not added. */
export function addedSince(capture: ShotCapture & { entries: readonly CaptureEntry[] }, before: readonly string[]): ShotCapture {
	const had = new Set(before);
	return captureOf(
		capture.shot,
		capture.entries.filter((e) => !had.has(e.item))
	);
}

/** The ids, as the Note keeps them: one line. */
export function capturedText(items: readonly string[]): string {
	return items.join(' ');
}

/** The ids a Note keeps. Anything unreadable is none: the Note is then rewritten whole. */
export function parseCaptured(value: unknown): string[] {
	return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}

export function noteSubject(capture: ShotCapture, label: Label): string {
	return label('sync.note.subject', { shot: capture.shot.code });
}

const list = (parts: readonly string[]) => parts.join(', ');

/** The lines of a capture: the element takes, the takes, the references, each under its heading when `headed`. */
function sections(capture: ShotCapture, label: Label): { heading: string; lines: string[] }[] {
	const typeLabel = (type: string) => label(`field.take.takeType.${type}`);
	const elements = capture.elements.map((g) =>
		label(g.tail ? 'sync.note.element.tail' : 'sync.note.element', {
			type: typeLabel(g.type),
			takes: list(g.takes.map((t) => label('sync.note.elementTake', { slate: t.slate, take: t.take })))
		})
	);
	const takes = capture.slates.map((s) => label(s.takes.length === 1 ? 'sync.note.slate.one' : 'sync.note.slate.other', { slate: s.slate, takes: list(s.takes) }));
	const references = capture.references.map((g) => label('sync.note.reference', { kind: kindLabel(g.kind, (key) => label(key)), names: list(g.names) }));
	return [
		{ heading: label('sync.note.elements'), lines: elements },
		{ heading: label('sync.note.takes'), lines: takes },
		{ heading: label('sync.note.references'), lines: references }
	].filter((s) => s.lines.length > 0);
}

/** The Note: a line on what it is, then each part under its heading, then the photo count. A part with nothing is left out. */
export function noteBody(capture: ShotCapture, label: Label): string {
	const blocks = [label('sync.note.intro', { shot: capture.shot.code }), ...sections(capture, label).map((s) => [s.heading, ...s.lines].join('\n'))];
	if (capture.photos > 0) blocks.push(label('sync.note.photos', { n: capture.photos }));
	return blocks.join('\n\n');
}

/** The reply to the Note when a sync added to it: what was added, in the Note's order, short. */
export function replyBody(added: ShotCapture, label: Label): string {
	const lines = sections(added, label).flatMap((s) => s.lines);
	if (added.photos > 0) lines.push(label(added.photos === 1 ? 'sync.note.reply.photos.one' : 'sync.note.reply.photos.other', { n: added.photos }));
	return [label('sync.note.reply'), ...lines].join('\n');
}
