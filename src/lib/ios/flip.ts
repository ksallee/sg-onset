// FLIP, pure: the layout changes at once, then each thing moves from where it was to where it
// is with a transform alone. This says what moved and by how much; components/ios/motion.ts
// measures and animates.

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Delta {
	/** The move that puts the new box back where the old one was, px. */
	dx: number;
	dy: number;
	/** The scale that gives it the old size. */
	sx: number;
	sy: number;
	/** False when the change is too small to see. */
	moved: boolean;
}

/** From `from` (where it was drawn) to `to` (where the layout now puts it). */
export function flipDelta(from: Box, to: Box): Delta {
	const dx = from.x - to.x;
	const dy = from.y - to.y;
	const sx = to.w > 0 && from.w > 0 ? from.w / to.w : 1;
	const sy = to.h > 0 && from.h > 0 ? from.h / to.h : 1;
	const moved = Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5 || Math.abs(sx - 1) >= 0.01 || Math.abs(sy - 1) >= 0.01;
	return { dx, dy, sx, sy, moved };
}

export interface ListChange<K> {
	/** Keys that are new, in their new order. */
	entered: K[];
	/** Keys that are gone, in their old order. */
	left: K[];
	/** Keys that stay and sit elsewhere, in their new order, with the move back to where they were. */
	moved: { key: K; dx: number; dy: number }[];
}

/** What changed in a list between two layouts, by key. */
export function listDiff<K>(before: ReadonlyMap<K, Box>, after: ReadonlyMap<K, Box>): ListChange<K> {
	const entered: K[] = [];
	const moved: ListChange<K>['moved'] = [];
	for (const [key, to] of after) {
		const from = before.get(key);
		if (!from) {
			entered.push(key);
			continue;
		}
		const dx = from.x - to.x;
		const dy = from.y - to.y;
		if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) moved.push({ key, dx, dy });
	}
	const left = [...before.keys()].filter((key) => !after.has(key));
	return { entered, left, moved };
}
