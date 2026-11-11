// The maths of a drag, pure: how an edge resists, where a flick would come to rest, how fast the
// finger was going when it let go, how dim the scrim is behind a sheet on its way down.

/**
 * A pull past an edge: the thing follows less the further it is pulled, and never further than
 * `dimension` (the size of what is pulled). The sign of `overshoot` is kept.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
	if (overshoot === 0 || dimension <= 0) return 0;
	const d = Math.abs(overshoot);
	return (Math.sign(overshoot) * (d * dimension * constant)) / (dimension + constant * d);
}

/**
 * How far a flick at `velocity` (px per second) would carry on before it stops, as a scroll
 * does. `rate`: 0.998 is a normal scroll, 0.99 stops sooner.
 */
export function project(velocity: number, rate = 0.998): number {
	return ((velocity / 1000) * rate) / (1 - rate);
}

export interface Sample {
	/** The position, px. */
	p: number;
	/** When, ms. */
	t: number;
}

/**
 * The speed at release, px per second, from the samples of the last `window` ms before `now`.
 * A finger that rested before lifting has none.
 */
export function releaseVelocity(samples: readonly Sample[], now: number, window = 80): number {
	const recent = samples.filter((s) => now - s.t <= window);
	if (recent.length < 2) return 0;
	const first = recent[0];
	const last = recent[recent.length - 1];
	if (last.t <= first.t) return 0;
	return ((last.p - first.p) / (last.t - first.t)) * 1000;
}

/**
 * How much of the scrim shows behind a sheet at `offset` px below its largest detent: all of it
 * down to the lowest detent (`lowest`), then less and less until the sheet is gone (`hidden`).
 */
export function dimProgress(offset: number, lowest: number, hidden: number): number {
	if (hidden <= lowest) return 1;
	return Math.max(0, Math.min(1, 1 - (offset - lowest) / (hidden - lowest)));
}
