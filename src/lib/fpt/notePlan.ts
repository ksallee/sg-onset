// What to write for the Note on a Shot (#97): its key, the lookup, who it is to, and whether a sync
// makes it, rewrites it with a reply, or leaves it. Pure: the text is shotNote.ts, the calls
// shotNotes.ts.
//
// Decided by Kevin, 2026-11-17: the Note is from whoever syncs; a sync with nothing new for a Shot
// writes nothing; when a later sync adds material, the Note is rewritten in place and a short
// reply says what was added; at each sync that writes the Note or a reply, people newly assigned
// to the Shot's Tasks are added to the addressees, and nobody is removed.
//
// From the corpus:
// - One Note per Shot, found again by its key in a text field made unique: a second create with the
//   key is 400 code 104, on a PUT too and under a person (findings/146, recipes/026).
// - Only `project` is needed to make a Note; `note_links` names the Shot, `tasks` its Tasks
//   (entity_types/Note.md, recipes/014).
// - A Group in `task_assignees` stays a Group (findings/150); a Group in `addressings_to` makes each
//   member follow the Note, as a person does (findings/147). The Note is addressed to what the
//   Tasks hold.
// - A bare list replaces a multi-entity field; the mode in the body adds (recipes/009). An
//   addressee added so follows at once (findings/149).
// - An edited Note is unread again for its addressees but writes no stream row; a reply reaches
//   the streams (findings/149, 067).
// - A Reply takes its Note in `entity`, sent on create: one with none cannot be deleted
//   (entity_types/Reply.md).

import type { Filter } from './api';
import { NOTE } from './schema';
import { addedSince, capturedText, noteBody, noteSubject, parseCaptured, replyBody, type CaptureEntry, type Label, type ShotCapture } from './shotNote';

export const TASK = 'Task';
export const REPLY = 'Reply';

type Ref = { type: string; id: number };
type Row = { id: number; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: unknown } | undefined> };

/** The key of a Shot's Note: the project and the Shot. The project is in it, as for a Set Shot: whether `unique` spans projects is unmeasured (findings/146). */
export function shotNoteKey(projectId: number, shotId: number): string {
	return `${projectId}:shot:${shotId}`;
}

/** The search for the Notes of these Shots, by key, in the project. */
export function noteFilter(projectId: number, keyField: string, shotIds: readonly number[]): Filter {
	return {
		logical_operator: 'and',
		conditions: [
			['project', 'is', { type: 'Project', id: projectId }],
			[keyField, 'in', shotIds.map((id) => shotNoteKey(projectId, id))]
		]
	};
}

const refsOf = (row: Row, field: string, types?: readonly string[]): Ref[] => {
	const data = row.relationships?.[field]?.data;
	const list = (Array.isArray(data) ? data : data ? [data] : []) as { type?: unknown; id?: unknown }[];
	const out = new Map<string, Ref>();
	for (const l of list) {
		if (typeof l?.type !== 'string' || typeof l.id !== 'number' || (types && !types.includes(l.type))) continue;
		out.set(`${l.type}:${l.id}`, { type: l.type, id: l.id });
	}
	return [...out.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id);
};

const keyOf = (r: Ref) => `${r.type}:${r.id}`;

/** A Note of ours as Flow PT holds it: its key, what it lists, who it is to, its Tasks. */
export type KeptNote = { id: number; key: string; captured: string[]; to: Ref[]; tasks: Ref[] };

/** The Notes of a search answer, by the names of the fields on the site. A row with no key is not ours. */
export function keptNotesOf(rows: readonly Row[], fields: { key: string; captured: string }): KeptNote[] {
	return rows.flatMap((row) => {
		const key = row.attributes?.[fields.key];
		if (typeof key !== 'string' || !key.trim()) return [];
		return [{ id: row.id, key: key.trim().toLowerCase(), captured: parseCaptured(row.attributes?.[fields.captured]), to: refsOf(row, 'addressings_to'), tasks: refsOf(row, 'tasks') }];
	});
}

/** A Shot's Tasks, and the people and Groups assigned to them as the Tasks hold them. */
export type ShotTasks = { tasks: Ref[]; to: Ref[] };

const PEOPLE = ['Group', 'HumanUser'];

/** Each Shot's Tasks and who they are assigned to, from Task rows with `entity` and `task_assignees`. */
export function shotTasksOf(rows: readonly Row[]): Map<number, ShotTasks> {
	const out = new Map<number, { tasks: Map<string, Ref>; to: Map<string, Ref> }>();
	for (const row of rows) {
		const [shot] = refsOf(row, 'entity', ['Shot']);
		if (!shot) continue;
		const at = out.get(shot.id) ?? { tasks: new Map(), to: new Map() };
		at.tasks.set(`Task:${row.id}`, { type: TASK, id: row.id });
		for (const r of refsOf(row, 'task_assignees', PEOPLE)) at.to.set(keyOf(r), r);
		out.set(shot.id, at);
	}
	const sorted = (m: Map<string, Ref>) => [...m.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id);
	return new Map([...out].map(([id, at]) => [id, { tasks: sorted(at.tasks), to: sorted(at.to) }]));
}

export type NoteWrite =
	| { kind: 'none' }
	| { kind: 'create'; data: Record<string, unknown> }
	| { kind: 'update'; id: number; data: Record<string, unknown>; reply: Record<string, unknown> };

const missing = (wanted: readonly Ref[], held: readonly Ref[]) => {
	const have = new Set(held.map(keyOf));
	return wanted.filter((r) => !have.has(keyOf(r)));
};
const add = (refs: readonly Ref[]) => ({ multi_entity_update_mode: 'add', value: refs });

/**
 * What to write for one Shot. Nothing while nothing was captured for it. Its Note when it has none.
 * When the Note lists less than was captured, the Note rewritten, the people and Tasks it lacks
 * added, and a reply with what was added. Otherwise nothing: what the Note listed that is gone is
 * no reason to write, and is put right by the next write.
 */
export function noteWrite(input: {
	projectId: number;
	capture: ShotCapture & { entries: readonly CaptureEntry[] };
	kept?: KeptNote;
	people: ShotTasks;
	fields: { key: string; captured: string };
	label: Label;
}): NoteWrite {
	const { capture, kept, people, fields, label } = input;
	if (!capture.items.length) return { kind: 'none' };
	const text = { subject: noteSubject(capture, label), content: noteBody(capture, label) };
	if (!kept) {
		return {
			kind: 'create',
			data: {
				project: { type: 'Project', id: input.projectId },
				...text,
				note_links: [{ type: 'Shot', id: capture.shot.id }],
				...(people.tasks.length ? { tasks: people.tasks } : {}),
				...(people.to.length ? { addressings_to: people.to } : {}),
				[fields.key]: shotNoteKey(input.projectId, capture.shot.id),
				[fields.captured]: capturedText(capture.items)
			}
		};
	}
	const added = addedSince(capture, kept.captured);
	if (!added.items.length) return { kind: 'none' };
	const to = missing(people.to, kept.to);
	const tasks = missing(people.tasks, kept.tasks);
	return {
		kind: 'update',
		id: kept.id,
		data: {
			...text,
			[fields.captured]: capturedText(capture.items),
			...(to.length ? { addressings_to: add(to) } : {}),
			...(tasks.length ? { tasks: add(tasks) } : {})
		},
		reply: { entity: { type: NOTE, id: kept.id }, content: replyBody(added, label) }
	};
}
