// Set Shots: one row of the project custom entity "Set Shot" per VFX shot code typed on set, linked
// from its slates, and linking the real Shots once there are some (Kevin, #102). At the shoot the
// Shots rarely exist yet: editorial makes them at turnover, often after wrap. The Set Shot holds the
// code meanwhile; the app links it to the Shots of its code at a later sync, or anyone sets them in
// Flow PT's grid. Pure: the reads and the writes are in transport.ts.
//
// From the corpus:
// - A text field created `unique: true` refuses a second row with the value, case and outer spaces
//   ignored, inside a `_batch` too (findings/127). The key is that field: a Set Shot is never made
//   twice for one code. Whether `unique` spans projects is unmeasured, so the key holds the
//   project (findings/136).
// - A link reads `{id, name, type}`, and a Shot's `name` is its code (findings/060,
//   field_types/multi_entity.md). So a Set Shot's Shots come with their codes in one read.

import type { Filter } from './api';
import { codeKey, SHOT, shotCodes, type ShotRow, type ShotWork } from './shots';

/** A Set Shot as read: its id, its key, its name now, and the Shots it links, each with its code. */
export type SetShotRow = { id: number; key: string; code: string; shots: ShotRow[] };

/** The key of a code in a project: the project id and the code as Flow PT matches it. */
export function setShotKey(projectId: number, code: string): string {
	return `${projectId}:${codeKey(code)}`;
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

/** The Set Shots of a search answer. A row with no key is not ours. */
export function setShotsOf(rows: readonly Row[], keyField: string, shotsField: string): SetShotRow[] {
	return rows.flatMap((row) => {
		const key = row.attributes?.[keyField];
		if (typeof key !== 'string' || !key.trim()) return [];
		const data = row.relationships?.[shotsField]?.data;
		const links = (Array.isArray(data) ? data : []) as Link[];
		const shots = links.flatMap((l) => (typeof l?.id === 'number' && (l.type ?? SHOT) === SHOT ? [{ id: l.id, code: typeof l.name === 'string' ? l.name.trim() : '' }] : []));
		const code = row.attributes?.code;
		return [{ id: row.id, key: key.trim().toLowerCase(), code: typeof code === 'string' ? code.trim() : '', shots }];
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

const byCode = (shots: readonly ShotRow[], code: string) => shots.filter((s) => codeKey(s.code) === codeKey(code));

/**
 * The Set Shots to link to the Shots of their code: those of these codes that hold no Shot and were
 * never seen holding one (`matched`). One seen holding a Shot and now empty was emptied by a person,
 * and a Shot a person unlinked is never linked again (Kevin, #96). The code matched is the one typed
 * on set, which the key holds: renaming a Set Shot moves nothing (Kevin, #102).
 */
export function setShotMatches(
	projectId: number,
	codes: readonly string[],
	setShots: readonly SetShotRow[],
	shots: readonly ShotRow[],
	matched: ReadonlySet<number>
): { id: number; shots: ShotRow[] }[] {
	const out = new Map<number, ShotRow[]>();
	for (const code of shotCodes(codes)) {
		const set = setShotOf(projectId, setShots, code);
		if (!set || set.shots.length || matched.has(set.id) || out.has(set.id)) continue;
		const having = byCode(shots, code);
		if (having.length) out.set(set.id, having);
	}
	return [...out].map(([id, found]) => ({ id, shots: found }));
}

/** The Set Shots holding a Shot: matched, never to be matched again. */
export function heldIds(setShots: readonly SetShotRow[]): number[] {
	return setShots.filter((s) => s.shots.length).map((s) => s.id);
}

/**
 * What to write to one slate, and what to say of its codes:
 * - `setShots`: the Set Shots of the codes it holds to add, of the codes taken off to remove.
 * - `shots`: the Shots to add and remove in the slate's own Shots field (#96), so artists stay one
 *   click from the slate. A code links its Set Shot's Shots; with no Set Shot yet, the Shots that
 *   have the code. A code taken off unlinks both, but never a Shot a code it holds links.
 * - `waiting`: codes to link or check whose Set Shot is not there yet, or holds no Shot yet. Asked
 *   about again at later syncs.
 * - `several`: codes whose Shots include more than one with that code. Shot codes are not unique
 *   (entity_types/Shot.md): all are linked, and the code is named so someone cleans up (Kevin, #96).
 *   A split, Shots of other codes, is not named.
 * - `removing`: the codes behind the removes. Owed, if an unlink fails.
 */
export type SlateLinks = {
	setShots: { add: number[]; remove: number[] };
	shots: { add: number[]; remove: number[] };
	waiting: string[];
	several: string[];
	removing: string[];
};

/** The writes for one slate, from the Set Shots of its codes and the Shots that have them. */
export function slateLinks(projectId: number, work: ShotWork, setShots: readonly SetShotRow[], shots: readonly ShotRow[]): SlateLinks {
	const setOf = (code: string) => setShotOf(projectId, setShots, code);
	const linksOf = (code: string): ShotRow[] => setOf(code)?.shots ?? byCode(shots, code);
	const ids = (rows: readonly { id: number }[]) => [...new Set(rows.map((r) => r.id))].sort((x, y) => x - y);
	const link = shotCodes(work.link);
	const held = new Set(link.map(codeKey));
	const gone = shotCodes(work.unlink).filter((code) => !held.has(codeKey(code)));
	const seen = shotCodes([...work.link, ...work.check]);
	const sets = (codes: string[]) => codes.flatMap((code) => setOf(code) ?? []);
	const addSets = ids(sets(link));
	const addShots = ids(link.flatMap(linksOf));
	const goneShots = (code: string) => [...(setOf(code)?.shots ?? []), ...byCode(shots, code)];
	return {
		setShots: { add: addSets, remove: ids(sets(gone)).filter((id) => !addSets.includes(id)) },
		shots: { add: addShots, remove: ids(gone.flatMap(goneShots)).filter((id) => !addShots.includes(id)) },
		waiting: seen.filter((code) => !setOf(code)?.shots.length),
		several: seen.filter((code) => ids(byCode(linksOf(code), code)).length > 1),
		removing: gone.filter((code) => setOf(code) !== undefined || goneShots(code).length > 0)
	};
}
