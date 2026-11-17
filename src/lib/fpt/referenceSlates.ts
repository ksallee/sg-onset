// The Slates field of a Set Reference (#107): the slates the reference shows on, every slate of its
// lighting setup for an HDRI 360, a 360 video or an HDR reference, its own slate for the rest
// (lib/references/lighting.ts). Derived, as a slate's Shots are (Kevin, #102, setShots.ts): set
// whole at each sync when it differs, nothing kept on the device, a link made by hand in Flow PT
// overwritten. `sg_slate` stays the slate it was logged on. Pure: the reads and the writes are in
// transport.ts.

/** One Set Reference Flow PT holds, and the slates it shows on now, by Flow PT id. */
export type ReferenceSlates = { reference: string; remoteId: number; slates: readonly number[] };

const idsOf = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);

/** What to set the field to: the slates, each once, in order. Nothing when it holds them already. */
export function referenceSlatesWrite(want: readonly number[], current: readonly number[]): number[] | undefined {
	const next = idsOf(want);
	const now = idsOf(current);
	return next.length === now.length && next.every((id, i) => id === now[i]) ? undefined : next;
}
