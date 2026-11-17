// The calls behind Set Shots and Shot links (#102), shared by the sync (transport.ts, `linkShots`)
// and the Action Menu Item's page (#106, sendSetData.ts). The rules are setShots.ts; this reads
// and writes them, against the project given.
//
// From the corpus:
// - A Set Shot is matched once: its Shots added and its flag ticked in one `_batch` of two updates,
//   in that order, together or not at all (findings/154).
// - Shot reads are not scoped by the endpoint: the project filter is ours (entity_types/Shot.md).
// - A multi_entity field is set whole with the mode in the body (recipes/009).

import { TransportError } from '$lib/outbox/transport';
import type { Api } from './api';
import { SET_SHOT_KEY, SET_SHOT_MATCHED, SET_SHOT_SHOTS, SET_SHOTS, SHOTS } from './mapping';
import { fieldName, type Resolution } from './schema';
import { keyCode, linkIdsOf, matches, setShotFilter, setShotsOf, slateWrites, toMatch, type SetShotRow } from './setShots';
import { linkValue, SHOT, shotFilter, shotsOf, type ShotRow } from './shots';

/** The Set Shot entity and its three fields, by their names on the site. */
export type SetShotFields = { type: string; key: string; shots: string; matched: string };

/** The Set Shot fields of a resolution, or undefined on a site without Set Shot (#117). */
export function setShotFields(res: Resolution): SetShotFields | undefined {
	const type = res.entities.setShot;
	if (!type) return undefined;
	return { type, key: fieldName(res, 'setShot', SET_SHOT_KEY), shots: fieldName(res, 'setShot', SET_SHOT_SHOTS), matched: fieldName(res, 'setShot', SET_SHOT_MATCHED) };
}

/** The fields to ask a Set Shot for. */
export const setShotRead = (f: SetShotFields) => [f.key, 'code', f.shots, f.matched];

/** The Set Shots of these codes, by key, in the project. Throws when the site cannot be asked. */
export async function readSetShots(api: Api, projectId: number, f: SetShotFields, codes: readonly string[], signal?: AbortSignal): Promise<SetShotRow[]> {
	if (!codes.length) return [];
	return setShotsOf(await api.searchAll(f.type, setShotFilter(projectId, f.key, codes), setShotRead(f), signal), f);
}

/**
 * Matches the Set Shots never matched that hold no Shot: one search for the Shots of their codes,
 * then per Set Shot one `_batch` that adds the Shots and ticks the flag, in that order, together
 * or not at all (findings/154). A Set Shot no Shot has the code of is tried at the next sync.
 * Never throws: what did not land is tried again. Answers the Set Shots as they are now.
 */
export async function matchSetShots(api: Api, projectId: number, f: SetShotFields, setShots: SetShotRow[], signal?: AbortSignal): Promise<SetShotRow[]> {
	const candidates = toMatch(setShots);
	if (!candidates.length) return setShots;
	let shots: ShotRow[];
	try {
		shots = shotsOf(await api.searchAll(SHOT, shotFilter(projectId, candidates.map((c) => keyCode(c.key))), ['code'], signal));
	} catch {
		return setShots;
	}
	const made = new Map<number, ShotRow[]>();
	for (const match of matches(candidates, shots)) {
		try {
			await api.batch(
				[
					{ request_type: 'update', entity: f.type, record_id: match.id, data: { [f.shots]: linkValue('add', match.shots.map((s) => s.id)) } },
					{ request_type: 'update', entity: f.type, record_id: match.id, data: { [f.matched]: true } }
				],
				signal
			);
			made.set(match.id, match.shots);
		} catch {
			// Read again at the next sync: landed or not, it is matched once.
		}
	}
	return setShots.map((s) => (made.has(s.id) ? { ...s, shots: made.get(s.id)!, matched: true } : s));
}

/** What a slate links now: its Set Shots and its Shots, by id. */
export type SlateLinks = { setShots: number[]; shots: number[] };

/** The Set Shots and Shots each slate holds on Flow PT now, by its id. A slate Flow PT lacks is left out. */
export async function slateLinks(api: Api, res: Resolution, ids: readonly number[], signal?: AbortSignal): Promise<Map<number, SlateLinks>> {
	const setShotsField = fieldName(res, 'slate', SET_SHOTS);
	const shotsField = fieldName(res, 'slate', SHOTS);
	const out = new Map<number, SlateLinks>();
	for (let i = 0; i < ids.length; i += 500) {
		const rows = await api.searchAll(res.entities.slate, ['id', 'in', ids.slice(i, i + 500)], [setShotsField, shotsField], signal);
		for (const row of rows) out.set(row.id, { setShots: linkIdsOf(row, setShotsField), shots: linkIdsOf(row, shotsField) });
	}
	return out;
}

/**
 * Writes the slates' Set Shots and Shots where they differ (`slateWrites`): one `PUT` a field, the
 * mode in the body (recipes/009). Kept apart, a refused field does not hold back the other. No
 * answer, or no session, stops the rest; a refusal is that slate's alone. Never throws. Answers
 * the slates a write of which did not land.
 */
export async function writeSlateLinks(
	api: Api,
	res: Resolution,
	projectId: number,
	slates: readonly { id: number; codes: readonly string[]; now: SlateLinks }[],
	setShots: readonly SetShotRow[],
	signal?: AbortSignal
): Promise<Set<number>> {
	const type = res.entities.setShot!;
	const failed = new Set<number>();
	let reachable = true;
	const write = async (id: number, field: string, value: unknown): Promise<void> => {
		if (!reachable) {
			failed.add(id);
			return;
		}
		try {
			await api.update(res.entities.slate, id, { [field]: value }, signal);
		} catch (error) {
			failed.add(id);
			if (error instanceof TransportError && error.kind !== 'failed') reachable = false;
		}
	};
	for (const slate of slates) {
		const writes = slateWrites(projectId, slate.codes, slate.now, setShots);
		if (writes.setShots) await write(slate.id, fieldName(res, 'slate', SET_SHOTS), linkValue('set', writes.setShots, type));
		if (writes.shots) await write(slate.id, fieldName(res, 'slate', SHOTS), linkValue('set', writes.shots));
	}
	return failed;
}
