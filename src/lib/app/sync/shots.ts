// The VFX shot codes of a project's slates, as sync links them: which slates to bring in line, when,
// and what the sync sheet lists. Nothing about links is kept on the device: each sync reads Flow PT
// again and works the links out from the codes (Kevin, #102, replacing #96's lists of codes waiting
// and unlinks owed). The transport writes (lib/fpt/setShots.ts, transport.ts). Pure.

import type { ShotResult, SlateCodes } from '$lib/fpt';
import { codeKey, shotCodes } from '$lib/fpt/shots';
import type { RemoteId } from '$lib/outbox/types';

type SlateLike = { id: string; shootDayId?: string; slateUID?: string; vfxShots?: readonly string[] };

/** Bring the links in line at most this often, unless a person asked to sync. */
export const LINK_MS = 60_000;

/** The project's Shot codes are read again after this, for the field's suggestions. */
export const CODES_MS = 5 * 60_000;

/** Whether to bring the links in line now. */
export function linkDue(lastAt: number | undefined, now: number, asked = false): boolean {
	return asked || lastAt === undefined || now - lastAt >= LINK_MS;
}

/** The slates of a project: those of its shoot days. */
export function projectSlates<T extends SlateLike>(days: readonly { id: string; projectId?: string }[], slates: readonly T[], projectId: string): T[] {
	const mine = new Set(days.filter((d) => d.projectId === projectId).map((d) => d.id));
	return slates.filter((s) => s.shootDayId !== undefined && mine.has(s.shootDayId));
}

/**
 * What to bring in line: every slate Flow PT holds, with the codes it holds now. A slate with no
 * codes is in it too: a code taken off is unlinked so.
 */
export function linkItems(slates: readonly SlateLike[], remoteIds: Record<string, RemoteId | undefined>): SlateCodes[] {
	return slates.flatMap((s) => {
		const remoteId = remoteIds[s.id];
		return typeof remoteId === 'number' ? [{ slate: s.id, remoteId, codes: shotCodes(s.vfxShots) }] : [];
	});
}

/** By slate id: the codes whose Set Shot holds several Shots of that code. Kept in memory only. */
export type Several = Record<string, string[]>;

/** The list after what a sync read: the whole of it when every slate was read, else slate by slate. */
export function mergeSeveral(several: Several, results: readonly ShotResult[], whole = false): Several {
	const out: Several = whole ? {} : { ...several };
	for (const { slate, several: codes } of results) {
		if (codes.length) out[slate] = [...codes];
		else delete out[slate];
	}
	return out;
}

/** A row of the sync sheet: one slate, its codes several Shots have. */
export type SeveralRow = { slateId: string; slate: string; several: string[] };

const bySlate = (a: SeveralRow, b: SeveralRow) => a.slate.localeCompare(b.slate, undefined, { numeric: true, sensitivity: 'base' });

/**
 * The sync sheet's rows, in slate order: the codes a slate still holds, spelled as typed now. A code
 * no Shot has yet is filed as a Set Shot, which is expected, and is not listed (Kevin, #102).
 */
export function severalRows(several: Several, slates: readonly SlateLike[]): SeveralRow[] {
	return slates
		.flatMap((s) => {
			const wanted = new Set((several[s.id] ?? []).map(codeKey));
			const codes = shotCodes(s.vfxShots).filter((code) => wanted.has(codeKey(code)));
			return codes.length ? [{ slateId: s.id, slate: s.slateUID ?? '', several: codes }] : [];
		})
		.sort(bySlate);
}

/** How many slates have codes that wait for Set Shot, on a site without it (Kevin, #117). */
export function waitingForSetShot(slates: readonly SlateLike[]): number {
	return slates.filter((s) => shotCodes(s.vfxShots).length > 0).length;
}

/**
 * The keys an older version kept for a project, no longer read: #96's lists of codes waiting and
 * unlinks owed, and the Set Shots this change first kept as matched. Removed when the project loads.
 */
export function legacyKeys(localProjectId: string): string[] {
	return [`shots:${localProjectId}`, `setShots:${localProjectId}`];
}
