// What is owed on the Flow PT Shots field of a project's slates: VFX shot codes not linked to a
// Shot yet, codes several Shots share, and unlinks not made yet. Kept on the device per project,
// made at later syncs, listed in the sync sheet. The transport writes (lib/fpt/shots.ts,
// transport.ts); this keeps the list. Pure.

import { codeKey, shotCodes } from '$lib/fpt/shots';
import type { RemoteId } from '$lib/outbox/types';

/**
 * One slate's share:
 * - `waiting`: codes to link. No Shot had them, or the write failed.
 * - `several`: codes more than one Shot has. All are linked; listed so someone cleans up.
 * - `unlink`: codes taken off whose Shots are still linked. Made at a later sync, until Flow PT
 *   matches the slate (Kevin, #96).
 */
export type SlateOwed = { waiting: string[]; several: string[]; unlink: string[] };

/** By slate id. */
export type Owed = Record<string, SlateOwed>;

type SlateLike = { id: string; slateUID?: string; vfxShots?: readonly string[] };

const VERSION = 1;

/** Ask Flow PT again at most this often, unless a person asked to sync. */
export const RETRY_MS = 60_000;

/** The project's Shot codes are read again after this, for the field's suggestions. */
export const CODES_MS = 5 * 60_000;

/** The key the list of a project is kept under. */
export function shotsKey(localProjectId: string): string {
	return `shots:${localProjectId}`;
}

export function serializeOwed(owed: Owed): string {
	return JSON.stringify({ v: VERSION, slates: owed });
}

const empty = (o: SlateOwed) => !o.waiting.length && !o.several.length && !o.unlink.length;

/** What was kept. Anything unreadable is nothing owed: the next push of a slate writes it again. */
export function parseOwed(raw: string | undefined): Owed {
	if (!raw) return {};
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return {};
	}
	const kept = value as { v?: unknown; slates?: unknown } | null;
	if (!kept || kept.v !== VERSION || !kept.slates || typeof kept.slates !== 'object') return {};
	const out: Owed = {};
	for (const [slate, entry] of Object.entries(kept.slates as Record<string, unknown>)) {
		if (!entry || typeof entry !== 'object') continue;
		const e = entry as Record<string, unknown>;
		const read: SlateOwed = { waiting: shotCodes(e.waiting), several: shotCodes(e.several), unlink: shotCodes(e.unlink) };
		if (!empty(read)) out[slate] = read;
	}
	return out;
}

/** The list after the transport's word on some slates: the last word holds. */
export function mergeOwed(owed: Owed, results: readonly ({ slate: string } & SlateOwed)[]): Owed {
	const out: Owed = { ...owed };
	for (const { slate, waiting, several, unlink } of results) {
		const next = { waiting: [...waiting], several: [...several], unlink: [...unlink] };
		if (empty(next)) delete out[slate];
		else out[slate] = next;
	}
	return out;
}

/**
 * The list as the slates stand now. A slate deleted is gone. A code to link or name that the slate
 * no longer holds is gone, and the rest keep the spelling typed now. An unlink owed goes once the
 * slate holds the code again.
 */
export function pruneOwed(owed: Owed, slates: readonly SlateLike[]): Owed {
	const out: Owed = {};
	for (const slate of slates) {
		const entry = owed[slate.id];
		if (!entry) continue;
		const typed = shotCodes(slate.vfxShots);
		const keys = new Set(typed.map(codeKey));
		const held = (codes: string[]) => {
			const wanted = new Set(codes.map(codeKey));
			return typed.filter((code) => wanted.has(codeKey(code)));
		};
		const next = { waiting: held(entry.waiting), several: held(entry.several), unlink: entry.unlink.filter((code) => !keys.has(codeKey(code))) };
		if (!empty(next)) out[slate.id] = next;
	}
	return out;
}

/**
 * What to ask Flow PT again, for the slates it holds: link the codes that wait, unlink what is
 * owed, and look again at the codes several Shots share.
 */
export function retryItems(
	owed: Owed,
	slates: readonly SlateLike[],
	remoteIds: Record<string, RemoteId | undefined>
): { slate: string; remoteId: number; link: string[]; unlink: string[]; check: string[] }[] {
	return Object.entries(pruneOwed(owed, slates)).flatMap(([slate, o]) => {
		const remoteId = remoteIds[slate];
		return typeof remoteId === 'number' ? [{ slate, remoteId, link: o.waiting, unlink: o.unlink, check: o.several }] : [];
	});
}

/** Whether to ask again now. */
export function retryDue(lastAt: number | undefined, now: number, asked = false): boolean {
	return asked || lastAt === undefined || now - lastAt >= RETRY_MS;
}

/** A row of the sync sheet: one slate, its codes no Shot has, its codes several Shots have. */
export type WaitingRow = { slateId: string; slate: string; none: string[]; several: string[] };

const bySlate = (a: WaitingRow, b: WaitingRow) => a.slate.localeCompare(b.slate, undefined, { numeric: true, sensitivity: 'base' });

/** The sync sheet's rows, in slate order. An unlink owed needs no one, and is left out. */
export function waitingRows(owed: Owed, slates: readonly SlateLike[]): WaitingRow[] {
	const pruned = pruneOwed(owed, slates);
	return slates
		.filter((s) => pruned[s.id] && (pruned[s.id].waiting.length || pruned[s.id].several.length))
		.map((s) => ({ slateId: s.id, slate: s.slateUID ?? '', none: pruned[s.id].waiting, several: pruned[s.id].several }))
		.sort(bySlate);
}
