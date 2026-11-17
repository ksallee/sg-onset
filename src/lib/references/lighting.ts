// Where a reference shows (#107). An HDRI 360, a 360 video or an HDR reference is shot once per
// lighting setup: it belongs to the lighting setup of the slate it was logged on, and shows on
// every slate of that lighting setup, now or later. Every other kind stays on its slate. Nothing
// is stored for it: the reference keeps its slate, and the slates it shows on follow from the
// lighting setups as they are now, as the switch rule of #92 and #93 does. Pure.

import type { Reference, Slate } from '$lib/model/types';
import { sortReferences } from './log';

/** The kinds that belong to the lighting setup, by key (kinds.ts). */
export const LIGHTING_KINDS = ['hdri360', 'video360', 'hdrReference'] as const;

export function isLightingKind(kind: string | undefined): boolean {
	return (LIGHTING_KINDS as readonly (string | undefined)[]).includes(kind);
}

type SlateLike = Pick<Slate, 'id' | 'lightingSetupId'>;

/**
 * The ids of the slates `ref` shows on, in the order of `slates`. A lighting reference: every slate
 * on the lighting setup of its slate, that slate too. Any other kind, or a slate with no lighting
 * setup or not among `slates`: its own slate.
 */
export function slatesOf(ref: Reference, slates: readonly SlateLike[]): string[] {
	const setup = isLightingKind(ref.kind) ? slates.find((s) => s.id === ref.slateId)?.lightingSetupId : undefined;
	return setup ? slates.filter((s) => s.lightingSetupId === setup).map((s) => s.id) : [ref.slateId];
}

/**
 * The references each slate shows, by slate id, each list in the order logged: the slate's own,
 * and the lighting references logged on another slate of its lighting setup. A slate that shows
 * none is absent.
 */
export function shownBySlate(slates: readonly SlateLike[], refs: readonly Reference[]): Map<string, Reference[]> {
	const setupOf = new Map(slates.map((s) => [s.id, s.lightingSetupId]));
	const onSetup = new Map<string, string[]>();
	for (const s of slates) if (s.lightingSetupId) onSetup.set(s.lightingSetupId, [...(onSetup.get(s.lightingSetupId) ?? []), s.id]);
	const out = new Map<string, Reference[]>();
	for (const ref of sortReferences(refs)) {
		const setup = isLightingKind(ref.kind) ? setupOf.get(ref.slateId) : undefined;
		for (const id of setup ? onSetup.get(setup)! : [ref.slateId]) out.set(id, [...(out.get(id) ?? []), ref]);
	}
	return out;
}
