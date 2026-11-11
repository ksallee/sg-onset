// Where a sheet goes when the finger lets go. Pure: Sheet.svelte measures and moves, this decides.
// Offsets are px the sheet's top sits below its large position (0: large, fully up).

/** `medium`: half the large height; `large`: all of it; a number: that share of it shown. */
export type Detent = 'medium' | 'large' | number;

/** px/ms past which a release is a flick: it goes on to the next detent its way. */
export const FLICK = 0.5;

/** How far below the large position a detent's top sits, for a sheet `sheetH` tall at large. */
export function detentOffset(d: Detent, sheetH: number): number {
	const shown = d === 'large' ? 1 : d === 'medium' ? 0.5 : Math.max(0, Math.min(1, d));
	return Math.round(sheetH * (1 - shown));
}

/**
 * The detent to settle on after a drag released at `offsetPx` with `velocity` (px/ms, + down),
 * or null to dismiss. Dismisses past a third of the smallest detent's height, or on a flick down
 * from it; a flick goes to the next detent its way; otherwise the nearest one.
 */
export function snapDetent(offsetPx: number, velocity: number, detents: readonly Detent[], sheetH: number, dismissible = true): Detent | null {
	if (detents.length === 0) return null;
	const at = detents.map((d) => ({ d, off: detentOffset(d, sheetH) })).sort((a, b) => a.off - b.off);
	const lowest = at[at.length - 1];
	if (Math.abs(velocity) > FLICK) {
		if (velocity > 0) {
			const next = at.find((x) => x.off > offsetPx);
			if (next) return next.d;
			return dismissible ? null : lowest.d;
		}
		const next = [...at].reverse().find((x) => x.off < offsetPx);
		return (next ?? at[0]).d;
	}
	if (dismissible && offsetPx > lowest.off + (sheetH - lowest.off) / 3) return null;
	let best = at[0];
	for (const x of at) if (Math.abs(x.off - offsetPx) < Math.abs(best.off - offsetPx)) best = x;
	return best.d;
}
