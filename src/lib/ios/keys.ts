// Keyboard moves, pure: where Tab goes in a modal sheet, where an arrow goes in a radio group.
// From holosession's builder/keys.ts. The components (Sheet, Segmented) read the focus and move
// it; the choice is here.

/**
 * The focusable to move to on Tab (`back`: Shift+Tab) in a modal of `count` focusables, focus at
 * `at` (-1: not on one of them). Null: leave it to the browser. -1: keep it on the modal itself.
 */
export function trapStep(count: number, at: number, back: boolean): number | null {
	if (count === 0) return -1;
	if (at < 0) return back ? count - 1 : 0;
	if (!back && at === count - 1) return 0;
	if (back && at === 0) return count - 1;
	return null;
}

/**
 * The option an arrow key (or Home, End) moves to in a radio group, from `at` (-1: none checked),
 * skipping the ones not `enabled`; wraps. Null: not a move, or nowhere to go.
 */
export function radioStep(key: string, at: number, enabled: readonly boolean[]): number | null {
	const n = enabled.length;
	const first = enabled.indexOf(true);
	if (first < 0) return null;
	if (key === 'Home') return first;
	if (key === 'End') return enabled.lastIndexOf(true);
	const dir = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
	if (dir === 0) return null;
	if (at < 0) return first;
	for (let k = 1; k < n; k++) {
		const i = (((at + dir * k) % n) + n) % n;
		if (enabled[i]) return i;
	}
	return null;
}
