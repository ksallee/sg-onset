// A row's swipe actions, pure: Row.svelte tracks the finger, this says where the row sits and
// where it settles on release. Trailing actions only (swipe left), as in iOS lists.

/** Width of one action button, px. */
export const ACTION_W = 74;
/** Share of the row past which a swipe is full: it runs the first action. */
export const FULL_AT = 0.6;

export interface SwipeState {
	/** px the row content sits left of rest (≤ 0). */
	offset: number;
	/** Where it goes on release: closed, open on the actions, or full (run the first action). */
	settle: 'closed' | 'open' | 'full';
	/** Past the full-swipe point: the first action stretches over the row. */
	full: boolean;
}

/**
 * The row at drag `dx` (px from where the drag would rest closed; negative: left) on a row `rowW`
 * wide with `actions`, and `velocity` (px/ms, negative: left) at release.
 */
export function swipeState(dx: number, rowW: number, actions: readonly unknown[], velocity = 0): SwipeState {
	if (actions.length === 0 || dx >= 0) return { offset: 0, settle: 'closed', full: false };
	const offset = Math.max(-rowW, dx);
	const full = -offset > rowW * FULL_AT;
	if (full) return { offset, settle: 'full', full };
	const width = actions.length * ACTION_W;
	let open = -offset > width / 2;
	if (velocity < -0.3) open = true;
	else if (velocity > 0.3) open = false;
	return { offset, settle: open ? 'open' : 'closed', full };
}
