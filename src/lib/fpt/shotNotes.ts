// The Notes on Shots on the site (#97): the reads and the writes behind shotNote.ts and
// notePlan.ts. Everything is read from Flow PT, nothing from the device, so a page with no data
// on it (the Action Menu Item of #106) runs the same calls with the person's session.
//
// For the Shots given, in one pass and a handful of searches: their codes, the Set Shots that hold
// them, the slates of those Set Shots, their takes, references and photos, the Shots' Tasks, and
// the Notes already there by key. A site without Set Reference has no references to read. Then per Shot, what notePlan.ts says: one create, or one PUT and
// one Reply, or nothing.
//
// From the corpus:
// - A Note is written as the person whose session it is: a script's Note create reached no stream
//   (findings/067), a person's did, at once (findings/149). The app's bearer is the person's own:
//   nothing names a sender (Kevin, 2026-11-17: the Note is from whoever syncs).
// - `in` on a multi-entity field matches a row that links any of the values (field_types/multi_entity.md);
//   on an entity field the same (field_types/entity.md). Shot and Task reads take a project filter
//   of their own (entity_types/Shot.md, Task.md).
// - A Note made twice for one key is refused, 400 code 104 (findings/146): another device made it
//   since the lookup. It is left for the next sync, which reads it.
// - The PUT goes before the Reply: if the Reply is lost, the Note is right and is unread again for
//   its addressees (findings/149); the other way round, a lost PUT would send the Reply twice.

import type { EntityRow } from 'sg-widgets-core';
import { TransportError } from '$lib/outbox/transport';
import { t } from '$lib/i18n/messages';
import type { Api, Filter } from './api';
import { NOTE, type Resolution } from './schema';
import { keptNotesOf, noteFilter, noteWrite, REPLY, shotNoteKey, shotTasksOf, TASK } from './notePlan';
import { linkIdsOf } from './setShots';
import { SHOT } from './shots';
import { noteReads, noteRecordsOf, shotCapture, type Label } from './shotNote';

/** What a sync did about one Shot's Note. */
export type NoteOutcome = 'created' | 'updated' | 'unchanged' | 'failed';
export type NoteResult = { shot: number; outcome: NoteOutcome };

const ATTACHMENT = 'Attachment';
const CHUNK = 500;
const project = (projectId: number): Filter => ['project', 'is', { type: 'Project', id: projectId }];
const refs = (type: string, ids: readonly number[]) => ids.map((id) => ({ type, id }));
const idsOf = (rows: readonly { id: number }[]) => [...new Set(rows.map((r) => r.id))].sort((a, b) => a - b);

/**
 * Writes the Note of each Shot given that needs one, from what Flow PT holds. Never throws: a Note
 * that did not land is worked out again at the next sync. Undefined when the site lacks the Note
 * fields or Set Shot, or could not be read: the Notes wait.
 */
export async function writeShotNotes(api: Api, res: Resolution, projectId: number, shotIds: readonly number[], signal?: AbortSignal, label: Label = t as Label): Promise<NoteResult[] | undefined> {
	const fields = res.note;
	const setShotType = res.entities.setShot;
	if (!fields || !setShotType) return undefined;
	const shotList = [...new Set(shotIds)].sort((a, b) => a - b);
	if (!shotList.length) return [];
	const reads = noteReads(res);

	/** Every row of `type` whose `field` is any of `values`, beside `also`, a list at a time. */
	async function rowsIn(type: string, field: string, values: readonly unknown[], fieldsAsked: string[], also: Filter[] = []): Promise<EntityRow[]> {
		const out: EntityRow[] = [];
		for (let i = 0; i < values.length; i += CHUNK) {
			const conditions: Filter[] = [...also, [field, 'in', values.slice(i, i + CHUNK)]];
			out.push(...(await api.searchAll(type, { logical_operator: 'and', conditions }, fieldsAsked, signal)));
		}
		return out;
	}

	let shots: EntityRow[], setShots: EntityRow[], slates: EntityRow[], takes: EntityRow[], references: EntityRow[], files: EntityRow[], tasks: EntityRow[], notes: EntityRow[];
	try {
		shots = await rowsIn(SHOT, 'id', shotList, ['code'], [project(projectId)]);
		setShots = await rowsIn(setShotType, reads.links.setShotShots, refs(SHOT, shotList), reads.setShot, [project(projectId)]);
		slates = await rowsIn(res.entities.slate, reads.links.slateSetShots, refs(setShotType, idsOf(setShots)), reads.slate);
		const slateRefs = refs(res.entities.slate, idsOf(slates));
		takes = await rowsIn(res.entities.take, reads.links.takeSlate, slateRefs, reads.take);
		// A reference reaches a slate through any of its links to slates (#107 adds one). A site
		// without Set Reference holds none: the Note lists no references (Kevin, #117).
		references = [];
		const referenceType = res.entities.reference;
		if (referenceType) for (const field of reads.links.referenceSlates) references.push(...(await rowsIn(referenceType, field, slateRefs, reads.reference)));
		const photoIds = [...new Set(takes.flatMap((row) => linkIdsOf(row, reads.links.takePhotos)))];
		files = await rowsIn(ATTACHMENT, 'id', photoIds, reads.file);
		tasks = await rowsIn(TASK, 'entity', refs(SHOT, shotList), ['entity', 'task_assignees'], [project(projectId)]);
		notes = [];
		for (let i = 0; i < shotList.length; i += CHUNK) notes.push(...(await api.searchAll(NOTE, noteFilter(projectId, fields.key, shotList.slice(i, i + CHUNK)), [fields.key, fields.captured, 'addressings_to', 'tasks'], signal)));
	} catch {
		return undefined;
	}

	const records = noteRecordsOf(res, { setShots, slates, takes, references: [...new Map(references.map((r) => [r.id, r])).values()], files });
	const people = shotTasksOf(tasks);
	const kept = new Map(keptNotesOf(notes, fields).map((n) => [n.key, n]));
	const codes = new Map(shots.map((row) => [row.id, typeof row.attributes.code === 'string' ? row.attributes.code.trim() : '']));

	let reachable = true;
	const out: NoteResult[] = [];
	for (const id of shotList) {
		// A Shot retired since, or of another project, is not written to.
		if (!codes.has(id)) continue;
		if (!reachable) {
			out.push({ shot: id, outcome: 'failed' });
			continue;
		}
		const write = noteWrite({
			projectId,
			capture: shotCapture({ id, code: codes.get(id)! }, records),
			kept: kept.get(shotNoteKey(projectId, id)),
			people: people.get(id) ?? { tasks: [], to: [] },
			fields,
			label
		});
		try {
			if (write.kind === 'create') await api.create(NOTE, write.data, signal);
			else if (write.kind === 'update') {
				await api.update(NOTE, write.id, write.data, signal);
				await api.create(REPLY, write.reply, signal);
			}
			out.push({ shot: id, outcome: write.kind === 'create' ? 'created' : write.kind === 'update' ? 'updated' : 'unchanged' });
		} catch (error) {
			// No answer, or no session: the rest would fare the same. A refusal is this Shot's alone;
			// one for a key another device took since the lookup is read at the next sync.
			if (error instanceof TransportError && error.kind !== 'failed') reachable = false;
			out.push({ shot: id, outcome: 'failed' });
		}
	}
	return out;
}
