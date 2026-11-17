// Set Shots: one row of the project custom entity "Set Shot" per VFX shot code typed on set, linked
// from its slates, and linking the real Shots once there are some (Kevin, #102). At the shoot the
// Shots rarely exist yet: editorial makes them at turnover, often after wrap. The Set Shot holds the
// code meanwhile. Pure: the reads and the writes are in transport.ts.
//
// Links to Shots are made in one place, the Set Shot's Shots field: by the app's match on the code,
// once, or by a person in Flow PT. The slate's own Shots field is derived from its Set Shots, and
// its Set Shots from its codes: both are worked out again at each sync, nothing is kept on the
// device (Kevin, #102, replacing #96's link rules).
//
// From the corpus:
// - A text field created `unique: true` refuses a second row with the value, case and outer spaces
//   ignored, inside a `_batch` too (findings/127). The key is that field: a Set Shot is never made
//   twice for one code. Whether `unique` spans projects is unmeasured, so the key holds the
//   project (findings/136).
// - A link reads `{id, name, type}`, and a Shot's `name` is its code (findings/060,
//   field_types/multi_entity.md). So a Set Shot's Shots come with their codes in one read, and a
//   retired Shot is gone from the list.

import type { Filter } from './api';
import { codeKey, SHOT, shotCodes, type ShotRow } from './shots';

/**
 * A Set Shot as read: its id, its key, its name now, the Shots it links with their codes, and
 * whether the app matched it already.
 */
export type SetShotRow = { id: number; key: string; code: string; shots: ShotRow[]; matched: boolean };

/** The key of a code in a project: the project id and the code as Flow PT matches it. */
export function setShotKey(projectId: number, code: string): string {
	return `${projectId}:${codeKey(code)}`;
}

/** The code a key holds, as Flow PT matches it: the one typed on set. */
export function keyCode(key: string): string {
	return key.slice(key.indexOf(':') + 1);
}

const keysOf = (projectId: number, codes: readonly string[]) => [...new Set(shotCodes(codes).map((code) => setShotKey(projectId, code)))];

/** The search for the Set Shots of these codes, by key, in the project. */
export function setShotFilter(projectId: number, keyField: string, codes: readonly string[]): Filter {
	return {
		logical_operator: 'and',
		conditions: [
			['project', 'is', { type: 'Project', id: projectId }],
			[keyField, 'in', keysOf(projectId, codes)]
		]
	};
}

type Link = { type?: unknown; id?: unknown; name?: unknown };
type Row = { id: number; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: unknown } | undefined> };

const linksOf = (row: Row, field: string): Link[] => {
	const data = row.relationships?.[field]?.data;
	return (Array.isArray(data) ? data : []) as Link[];
};
const byId = (a: number, b: number) => a - b;
const idsOf = (ids: readonly number[]) => [...new Set(ids)].sort(byId);

/** The ids a link field of a row holds, each once, in order. */
export function linkIdsOf(row: Row, field: string): number[] {
	return idsOf(linksOf(row, field).flatMap((l) => (typeof l?.id === 'number' ? [l.id] : [])));
}

/** The Set Shots of a search answer, by the names of their fields on the site. A row with no key is not ours. */
export function setShotsOf(rows: readonly Row[], fields: { key: string; shots: string; matched: string }): SetShotRow[] {
	return rows.flatMap((row) => {
		const key = row.attributes?.[fields.key];
		if (typeof key !== 'string' || !key.trim()) return [];
		const shots = linksOf(row, fields.shots).flatMap((l) =>
			typeof l?.id === 'number' && (l.type ?? SHOT) === SHOT ? [{ id: l.id, code: typeof l.name === 'string' ? l.name.trim() : '' }] : []
		);
		const code = row.attributes?.code;
		return [{ id: row.id, key: key.trim().toLowerCase(), code: typeof code === 'string' ? code.trim() : '', shots, matched: row.attributes?.[fields.matched] === true }];
	});
}

const setShotOf = (projectId: number, setShots: readonly SetShotRow[], code: string) => setShots.find((s) => s.key === setShotKey(projectId, code));

/** The codes to file as a new Set Shot: those with none yet, each once, as typed. */
export function missingCodes(projectId: number, codes: readonly string[], setShots: readonly SetShotRow[]): string[] {
	return shotCodes(codes).filter((code) => !setShotOf(projectId, setShots, code));
}

/** The `data` of a Set Shot's create: the project, the code as typed for its name, the key. */
export function setShotData(projectId: number, code: string, keyField: string): Record<string, unknown> {
	return { project: { type: 'Project', id: projectId }, code: code.trim(), [keyField]: setShotKey(projectId, code) };
}

/**
 * The Set Shots to match: never matched, and holding no Shot. The app matches a Set Shot once, and
 * the flag on it says so on every device: one a person emptied after a match stays empty, and one
 * a person filled is left as it is (Kevin, #102).
 */
export function toMatch(setShots: readonly SetShotRow[]): SetShotRow[] {
	return setShots.filter((s) => !s.matched && !s.shots.length);
}

/**
 * Each Set Shot to match, with every Shot that has the code typed on set: the one its key holds,
 * not its name now, so renaming a Set Shot moves nothing. Shot codes are not unique
 * (entity_types/Shot.md): all are taken. A Set Shot no Shot has the code of is left for a later
 * sync.
 */
export function matches(candidates: readonly SetShotRow[], shots: readonly ShotRow[]): { id: number; shots: ShotRow[] }[] {
	return candidates.flatMap((set) => {
		const having = shots.filter((s) => codeKey(s.code) === keyCode(set.key));
		return having.length ? [{ id: set.id, shots: having }] : [];
	});
}

/** The Set Shots of a slate's codes, those filed. */
export function slateSetShots(projectId: number, codes: readonly string[], setShots: readonly SetShotRow[]): number[] {
	return idsOf(shotCodes(codes).flatMap((code) => setShotOf(projectId, setShots, code)?.id ?? []));
}

/**
 * The Shots a slate links: every Shot of its Set Shots, each once. The slate's Shots field holds
 * this and nothing else (Kevin, #102). The sync works it out from the slate's codes; a page with no
 * data on the device, from the Set Shots Flow PT links the slate to (#106).
 */
export function derivedShots(setShotIds: readonly number[], setShots: readonly SetShotRow[]): number[] {
	const wanted = new Set(setShotIds);
	return idsOf(setShots.filter((s) => wanted.has(s.id)).flatMap((s) => s.shots.map((shot) => shot.id)));
}

/**
 * The codes whose Set Shot holds more than one Shot of that code. Shot codes are not unique: all
 * are linked, and the code is named so someone cleans up (Kevin, #96). A Set Shot holding Shots of
 * other codes, a shot editorial split, is not named.
 */
export function severalCodes(projectId: number, codes: readonly string[], setShots: readonly SetShotRow[]): string[] {
	return shotCodes(codes).filter((code) => {
		const set = setShotOf(projectId, setShots, code);
		return set !== undefined && idsOf(set.shots.filter((s) => codeKey(s.code) === codeKey(code)).map((s) => s.id)).length > 1;
	});
}

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * What to write to one slate: its Set Shots are those of its codes, its Shots those of its Set
 * Shots. A field that holds that already is left alone; one that does not is written whole, in
 * `set` mode, so a link made by hand on the slate is overwritten and one a code taken off made is
 * cleared. A wrong link is fixed on the Set Shot, not the slate.
 */
export function slateWrites(
	projectId: number,
	codes: readonly string[],
	current: { setShots: readonly number[]; shots: readonly number[] },
	setShots: readonly SetShotRow[]
): { setShots?: number[]; shots?: number[] } {
	const sets = slateSetShots(projectId, codes, setShots);
	const shots = derivedShots(sets, setShots);
	return {
		...(same(sets, idsOf(current.setShots)) ? {} : { setShots: sets }),
		...(same(shots, idsOf(current.shots)) ? {} : { shots })
	};
}
