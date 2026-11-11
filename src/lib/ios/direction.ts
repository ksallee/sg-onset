// Which way a navigation moves, pure: the root layout runs the View Transition, this picks it.

export type NavDirection = 'push' | 'pop' | 'cover' | 'uncover' | 'none';

/** The tab roots: moving between them does not slide. */
export const TAB_ROOTS = ['/', '/sessions', '/settings'];

const trim = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
const isCover = (path: string) => /\/run$/.test(trim(path));

/** How deep a page sits: tab roots 0, `/t/box` 1, one more per segment. */
export function depth(path: string): number {
	const p = trim(path);
	if (TAB_ROOTS.includes(p)) return 0;
	return Math.max(0, p.split('/').filter(Boolean).length - 1);
}

/**
 * The move from page `from` to page `to` (pathnames; null: none). The run screen comes up as a
 * cover and goes down as one; deeper pushes, shallower pops; a sibling detail pushes; tabs and
 * the same page do not move. `history` (browser back or forward) wins over depth: back always pops.
 */
export function navDirection(
	from: string | null,
	to: string | null,
	history?: 'back' | 'forward'
): NavDirection {
	if (!from || !to) return 'none';
	const a = trim(from);
	const b = trim(to);
	if (a === b) return 'none';
	if (isCover(b)) return 'cover';
	if (isCover(a)) return 'uncover';
	const da = depth(a);
	const db = depth(b);
	if (da === 0 && db === 0) return 'none';
	if (history) return history === 'back' ? 'pop' : 'push';
	if (db > da) return 'push';
	if (db < da) return 'pop';
	return da === 0 ? 'none' : 'push';
}
