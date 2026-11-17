// The VFX shot codes of a project's slates that are not linked to a Flow PT Shot yet: kept on the
// device per project, asked about again at later syncs, listed in the sync sheet. The transport
// links them (lib/fpt/shots.ts, transport.ts); this keeps the list. Pure.

import { codeKey, shotCodes } from '$lib/fpt/shots';
import type { RemoteId } from '$lib/outbox/types';

/** Codes not linked yet, by slate id. */
export type Waiting = Record<string, string[]>;

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

export function serializeWaiting(waiting: Waiting): string {
	return JSON.stringify({ v: VERSION, slates: waiting });
}

/** What was kept. Anything unreadable is an empty list: the next push of a slate writes it again. */
export function parseWaiting(raw: string | undefined): Waiting {
	if (!raw) return {};
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return {};
	}
	const kept = value as { v?: unknown; slates?: unknown } | null;
	if (!kept || kept.v !== VERSION || !kept.slates || typeof kept.slates !== 'object') return {};
	const out: Waiting = {};
	for (const [slate, codes] of Object.entries(kept.slates as Record<string, unknown>)) {
		const list = shotCodes(codes);
		if (list.length) out[slate] = list;
	}
	return out;
}

/** The list after the transport's word on some slates: the last word holds. */
export function mergeWaiting(waiting: Waiting, results: readonly { slate: string; waiting: readonly string[] }[]): Waiting {
	const out: Waiting = { ...waiting };
	for (const r of results) {
		if (r.waiting.length) out[r.slate] = [...r.waiting];
		else delete out[r.slate];
	}
	return out;
}

/**
 * The list as the slates stand now: a slate deleted is gone, a code taken off since is gone, and a
 * code keeps the spelling typed now.
 */
export function pruneWaiting(waiting: Waiting, slates: readonly SlateLike[]): Waiting {
	const out: Waiting = {};
	for (const slate of slates) {
		const codes = waiting[slate.id];
		if (!codes) continue;
		const wanted = new Set(codes.map(codeKey));
		const held = shotCodes(slate.vfxShots).filter((code) => wanted.has(codeKey(code)));
		if (held.length) out[slate.id] = held;
	}
	return out;
}

/** What to ask Flow PT again: the slates it holds, with the codes they still wait on. */
export function retryItems(waiting: Waiting, slates: readonly SlateLike[], remoteIds: Record<string, RemoteId | undefined>): { slate: string; remoteId: number; codes: string[] }[] {
	return Object.entries(pruneWaiting(waiting, slates)).flatMap(([slate, codes]) => {
		const remoteId = remoteIds[slate];
		return typeof remoteId === 'number' ? [{ slate, remoteId, codes }] : [];
	});
}

/** Whether to ask again now. */
export function retryDue(lastAt: number | undefined, now: number, asked = false): boolean {
	return asked || lastAt === undefined || now - lastAt >= RETRY_MS;
}

export type WaitingRow = { slateId: string; slate: string; codes: string[] };

const bySlate = (a: WaitingRow, b: WaitingRow) => a.slate.localeCompare(b.slate, undefined, { numeric: true, sensitivity: 'base' });

/** The sync sheet's rows: each slate with codes that wait, in slate order. */
export function waitingRows(waiting: Waiting, slates: readonly SlateLike[]): WaitingRow[] {
	const pruned = pruneWaiting(waiting, slates);
	return slates
		.filter((s) => pruned[s.id])
		.map((s) => ({ slateId: s.id, slate: s.slateUID ?? '', codes: pruned[s.id] }))
		.sort(bySlate);
}
