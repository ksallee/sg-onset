// The slates each set reference shows on, by Flow PT id, for its Slates field (#107): every slate of
// its lighting setup for a lighting reference, its own slate for the rest (lib/references/lighting.ts).
// Worked out from the records on the device at each sync; the transport sets the field where it
// differs (lib/fpt/referenceSlates.ts). Nothing is kept on the device. Pure.

import type { ReferenceSlates } from '$lib/fpt/referenceSlates';
import type { Reference, Slate } from '$lib/model/types';
import type { RemoteId } from '$lib/outbox/types';
import { slatesOf } from '$lib/references/lighting';

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

/**
 * Each reference Flow PT holds, with the slates it shows on that Flow PT holds, each once, in order.
 * A slate Flow PT does not hold yet is left out: a later sync adds it.
 */
export function referenceSlateItems(refs: readonly Reference[], slates: readonly Slate[], remoteIds: Record<string, RemoteId | undefined>): ReferenceSlates[] {
	return refs.flatMap((ref) => {
		const remoteId = remoteIds[ref.id];
		if (!isId(remoteId)) return [];
		const ids = slatesOf(ref, slates)
			.map((id) => remoteIds[id])
			.filter(isId);
		return [{ reference: ref.id, remoteId, slates: [...new Set(ids)].sort((a, b) => a - b) }];
	});
}

/** The key an earlier build of #107 kept a list under, per project. Nothing is kept now: it is removed. */
export function legacyReferenceSlatesKey(localProjectId: string): string {
	return `referenceSlates:${localProjectId}`;
}
