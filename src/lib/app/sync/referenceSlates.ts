// The Slates field of each set reference in Flow PT (#107): the slates it shows on, every slate of
// its lighting setup for a lighting reference, its own slate for the rest (lib/references/lighting.ts).
// What the device last wrote there is kept per project; when a drain ends the app works out what
// to add and take off so the field matches the slates as they are now, and the transport writes
// it (lib/fpt/transport.ts). Nothing is stored on the reference: a new slate on the lighting setup,
// a slate moved to another one, or a change of kind all show here. Pure.

import type { Reference, Slate } from '$lib/model/types';
import type { RemoteId } from '$lib/outbox/types';
import { slatesOf } from '$lib/references/lighting';

/** By reference id: the Flow PT row written, and the slates its field holds from this device, by Flow PT id. */
export type Linked = Record<string, { remote: number; slates: number[] }>;

/** What to write on one reference's field, by Flow PT id. */
export type ReferenceSlatesWork = { reference: string; remoteId: number; add: number[]; remove: number[] };

/** The writes, and what Flow PT holds once they all land. */
export type ReferenceSlatesPlan = { work: ReferenceSlatesWork[]; linked: Linked };

const VERSION = 1;

/** The key the list of a project is kept under. */
export function referenceSlatesKey(localProjectId: string): string {
	return `referenceSlates:${localProjectId}`;
}

export function serializeLinked(linked: Linked): string {
	return JSON.stringify({ v: VERSION, refs: linked });
}

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

/** What was kept. Anything unreadable is nothing linked: the next sync adds again, and an add of a slate there changes nothing. */
export function parseLinked(raw: string | undefined): Linked {
	if (!raw) return {};
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return {};
	}
	const kept = value as { v?: unknown; refs?: unknown } | null;
	if (!kept || kept.v !== VERSION || !kept.refs || typeof kept.refs !== 'object') return {};
	const out: Linked = {};
	for (const [id, entry] of Object.entries(kept.refs as Record<string, unknown>)) {
		const e = entry as { remote?: unknown; slates?: unknown } | null;
		if (!e || !isId(e.remote) || !Array.isArray(e.slates)) continue;
		out[id] = { remote: e.remote, slates: e.slates.filter(isId) };
	}
	return out;
}

const sorted = (ids: Iterable<number>) => [...new Set(ids)].sort((a, b) => a - b);

/**
 * What to write so each reference's field holds the slates it shows on, for the references Flow PT
 * holds. A slate Flow PT does not hold yet waits, and is added once it does. Only a slate this
 * device linked, still on the device and no longer showing the reference, is taken off: a slate a
 * person linked or unlinked in Flow PT is left as they made it, and a slate deleted leaves the
 * field by itself (corpus field_types/multi_entity.md). A reference made again under another
 * Flow PT id, as an undone delete is, starts again.
 */
export function planReferenceSlates(refs: readonly Reference[], slates: readonly Slate[], remoteIds: Record<string, RemoteId | undefined>, linked: Linked): ReferenceSlatesPlan {
	const remoteOf = (id: string): number | undefined => {
		const r = remoteIds[id];
		return isId(r) ? r : undefined;
	};
	const live = new Set(slates.map((s) => remoteOf(s.id)).filter(isId));
	const work: ReferenceSlatesWork[] = [];
	const next: Linked = {};
	for (const ref of refs) {
		const remoteId = remoteOf(ref.id);
		if (remoteId === undefined) continue;
		const want = sorted(slatesOf(ref, slates).map(remoteOf).filter(isId));
		const before = linked[ref.id]?.remote === remoteId ? linked[ref.id].slates : [];
		const add = want.filter((id) => !before.includes(id));
		const remove = sorted(before.filter((id) => live.has(id) && !want.includes(id)));
		if (add.length || remove.length) work.push({ reference: ref.id, remoteId, add, remove });
		next[ref.id] = { remote: remoteId, slates: want };
	}
	return { work, linked: next };
}

/** What Flow PT holds after the writes: the plan, but as it was for a reference whose write did not land. */
export function afterWrites(plan: ReferenceSlatesPlan, before: Linked, failed: readonly string[]): Linked {
	const out: Linked = { ...plan.linked };
	for (const id of failed) {
		if (before[id]) out[id] = before[id];
		else delete out[id];
	}
	return out;
}
