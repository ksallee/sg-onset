// "Send set data to artists" (#106): the reads and writes behind the Action Menu Item's page. A
// person at turnover selects Shots or Set Shots in Flow PT's web interface and runs it; the page,
// on a desktop with nothing on it, runs this with that person's session. Everything is read from
// Flow PT. The rules are the sync's: setShots.ts for the links, shotNote.ts and notePlan.ts for the
// Notes; the scope and the report are sendPlan.ts.
//
// 1. The rows selected, in the project. On Shots: their codes, the Set Shots holding them, and the
//    Set Shots of their codes by key. On Set Shots: those rows.
// 2. The code match of #102 on those Set Shots, once each: a Set Shot never matched that holds no
//    Shot gets every Shot of the project with its code, and its flag (setShotLinks.ts).
// 3. The slates linking the Set Shots of the run: each set to the Set Shots of its codes and the
//    Shots of those (`slateWrites`), where it differs.
// 4. The Note of each Shot of the run (shotNotes.ts), whatever a device's Notes on Shots setting:
//    running the action is the request.
//
// From the corpus: Shot and Task reads take a project filter of their own (entity_types/Shot.md);
// `in` on a multi-entity field matches a row that links any of the values
// (field_types/multi_entity.md); a Set Shot's match is one `_batch` (findings/154).

import type { EntityRow } from 'sg-widgets-core';
import { TransportError } from '$lib/outbox/transport';
import { t } from '$lib/i18n/messages';
import type { Api, Filter } from './api';
import { fieldMap, SET_SHOTS, SHOTS } from './mapping';
import { fromRow } from './payload';
import { fieldName, type Resolution } from './schema';
import { mergeSetShots, sendScope, shotReports, type SendKind, type ShotReport } from './sendPlan';
import { matchSetShots, readSetShots, setShotFields, setShotRead, writeSlateLinks, type SetShotFields } from './setShotLinks';
import { linkIdsOf, setShotsOf, slateSetShots, type SetShotRow } from './setShots';
import { writeShotNotes, type NoteResult } from './shotNotes';
import { SHOT, SHOT_CODES_KEY, shotCodes, shotsOf, type ShotRow } from './shots';
import type { Label } from './shotNote';

const CHUNK = 500;
const project = (projectId: number): Filter => ['project', 'is', { type: 'Project', id: projectId }];
const refs = (type: string, ids: readonly number[]) => ids.map((id) => ({ type, id }));

/** Every row of `type` whose `field` is any of `values`, in the project, a list at a time. */
async function rowsIn(api: Api, projectId: number, type: string, field: string, values: readonly unknown[], fields: string[], signal?: AbortSignal): Promise<EntityRow[]> {
	const out: EntityRow[] = [];
	for (let i = 0; i < values.length; i += CHUNK) {
		out.push(...(await api.searchAll(type, { logical_operator: 'and', conditions: [project(projectId), [field, 'in', values.slice(i, i + CHUNK)]] }, fields, signal)));
	}
	return out;
}

const fieldsOf = (res: Resolution): SetShotFields => {
	const f = setShotFields(res);
	// The page asks only on a site with Set Shot (sendKind).
	if (!f) throw new TransportError('failed', 'This site has no Set Shot entity.');
	return f;
};

/** What the page shows before Send. */
export type SendPreview = {
	/** The Flow PT project's name. */
	project: string;
	kind: SendKind;
	/** The selected rows Flow PT holds in the project, by code. */
	rows: ShotRow[];
	/** Selected rows it does not hold there: another project's, deleted, or not one of ours. */
	missing: number;
	/** The site has the Note fields: the Notes are written. */
	notes: boolean;
};

const byCode = (a: ShotRow, b: ShotRow) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }) || a.id - b.id;

/** The selected rows, as Flow PT holds them in the project. Writes nothing. Throws when the site cannot be asked. */
export async function previewSend(api: Api, res: Resolution, projectId: number, request: { kind: SendKind; ids: readonly number[] }, signal?: AbortSignal): Promise<SendPreview> {
	const [named] = await api.search('Project', ['id', 'is', projectId], ['name'], 1, signal);
	const rows = request.kind === 'shot' ? await selectedShots(api, projectId, request.ids, signal) : (await selectedSetShots(api, projectId, fieldsOf(res), request.ids, signal)).map((s) => ({ id: s.id, code: s.code }));
	return {
		project: typeof named?.attributes.name === 'string' ? named.attributes.name : String(projectId),
		kind: request.kind,
		rows: [...rows].sort(byCode),
		missing: request.ids.length - rows.length,
		notes: !!res.note
	};
}

async function selectedShots(api: Api, projectId: number, ids: readonly number[], signal?: AbortSignal): Promise<ShotRow[]> {
	return shotsOf(await rowsIn(api, projectId, SHOT, 'id', ids, ['code'], signal));
}

/** The selected Set Shots of ours: a row with no key was not filed by SG OnSet. */
async function selectedSetShots(api: Api, projectId: number, f: SetShotFields, ids: readonly number[], signal?: AbortSignal): Promise<SetShotRow[]> {
	return setShotsOf(await rowsIn(api, projectId, f.type, 'id', ids, setShotRead(f), signal), f);
}

/** What a run did. */
export type SendResult = {
	kind: SendKind;
	/** Per Shot of the run, by code. */
	shots: ShotReport[];
	/** The Set Shots selected that hold no Shot after the match: no Shot has their code yet. */
	waiting: ShotRow[];
	/** Selected rows Flow PT does not hold in the project. */
	missing: number;
	/** Flow PT stopped answering, or the session went, part way: what is listed as done went, the rest did not. */
	stopped: boolean;
};

/**
 * Runs the action on the rows selected. Throws a `TransportError` when the rows cannot be read:
 * then nothing was written. Past that it never throws: a write that did not land is said on its
 * Shot, and a run that stopped says so.
 */
export async function sendSetData(api: Api, res: Resolution, projectId: number, request: { kind: SendKind; ids: readonly number[] }, signal?: AbortSignal, label: Label = t as Label): Promise<SendResult> {
	const f = fieldsOf(res);
	const vfxShots = fieldName(res, 'slate', fieldMap('slate', SHOT_CODES_KEY)!.columns[0]);
	const setShotsField = fieldName(res, 'slate', SET_SHOTS);
	const shotsField = fieldName(res, 'slate', SHOTS);

	// 1. The rows selected. No answer here: nothing was written, the caller says so.
	let shots: ShotRow[] = [];
	let before: SetShotRow[];
	let found: number;
	if (request.kind === 'shot') {
		shots = await selectedShots(api, projectId, request.ids, signal);
		const holding = setShotsOf(await rowsIn(api, projectId, f.type, f.shots, refs(SHOT, shots.map((s) => s.id)), setShotRead(f), signal), f);
		const keyed = await readSetShots(api, projectId, f, shots.map((s) => s.code), signal);
		before = mergeSetShots(holding, keyed);
		found = shots.length;
	} else {
		before = await selectedSetShots(api, projectId, f, request.ids, signal);
		found = before.length;
	}

	// 2. The match, once per Set Shot. Never throws.
	const after = await matchSetShots(api, projectId, f, before, signal);
	const scope = request.kind === 'shot' ? sendScope({ kind: 'shot', shots, setShots: after }) : sendScope({ kind: 'setShot', selected: request.ids, setShots: after });
	const waiting = request.kind === 'setShot' ? scope.setShots.filter((s) => !s.shots.length).map((s) => ({ id: s.id, code: s.code })) : [];

	let stopped = false;
	let slates: { id: number; setShots: number[] }[] = [];
	let failedSlates = new Set<number>();
	let notes: NoteResult[] | undefined = res.note ? [] : undefined;
	try {
		// A run on Set Shots acts on the Shots of this project only.
		const runShots = request.kind === 'shot' ? scope.shots : scope.shots.length ? await selectedShots(api, projectId, scope.shots.map((s) => s.id), signal) : [];
		shots = runShots;

		// 3. The slates of the run's Set Shots, set to what their codes say.
		const rows = scope.setShots.length ? await rowsIn(api, projectId, res.entities.slate, setShotsField, refs(f.type, scope.setShots.map((s) => s.id)), [vfxShots, setShotsField, shotsField], signal) : [];
		const held = rows.map((row) => ({
			id: row.id,
			codes: shotCodes(fromRow(res, 'slate', row, [SHOT_CODES_KEY])[SHOT_CODES_KEY]),
			now: { setShots: linkIdsOf(row, setShotsField), shots: linkIdsOf(row, shotsField) }
		}));
		// Every code of those slates, so a slate keeps the Set Shots of its other codes.
		const all = mergeSetShots(await readSetShots(api, projectId, f, held.flatMap((s) => s.codes), signal), after);
		failedSlates = await writeSlateLinks(api, res, projectId, held, all, signal);
		slates = held.map((s) => ({ id: s.id, setShots: slateSetShots(projectId, s.codes, all) }));

		// 4. The Notes. Undefined from here means no answer: the run stopped.
		if (res.note) {
			const written = await writeShotNotes(api, res, projectId, shots.map((s) => s.id), signal, label);
			if (written === undefined) stopped = true;
			notes = written ?? [];
		}
	} catch (error) {
		if (!(error instanceof TransportError)) throw error;
		stopped = true;
	}

	return {
		kind: request.kind,
		shots: shotReports({ shots, before, after, slates, failedSlates, notes }),
		waiting,
		missing: request.ids.length - found,
		stopped
	};
}
