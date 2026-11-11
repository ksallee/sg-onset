// Which way a navigation moves, pure: the root layout runs the View Transition, this picks it.

export type NavDirection = 'push' | 'pop' | 'cover' | 'uncover' | 'none';

/** The tab roots: moving between them does not slide. */
export const TAB_ROOTS = ['/', '/shoot', '/slates', '/wrap', '/gear', '/templates', '/settings'];

const trim = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/** One-segment pages that sit over a tab root: sign-in opens from Settings. */
export const PUSHED_OVER: Record<string, string> = { '/sign-in': '/settings' };
export const PUSHED = Object.keys(PUSHED_OVER);

/** The tab root a page belongs to: itself, the root it is under, or the root it sits over. None outside the tabs. */
export function tabOf(path: string): string | undefined {
	const p = trim(path);
	if (p in PUSHED_OVER) return PUSHED_OVER[p];
	return TAB_ROOTS.find((root) => root !== '/' && (p === root || p.startsWith(`${root}/`)));
}

const isCover = (path: string) => /\/run$/.test(trim(path));

/** How deep a page sits: tab roots 0, `/t/box` 1, one more per segment. */
export function depth(path: string): number {
	const p = trim(path);
	if (TAB_ROOTS.includes(p)) return 0;
	if (PUSHED.includes(p)) return 1;
	return Math.max(0, p.split('/').filter(Boolean).length - 1);
}

/**
 * The move from page `from` to page `to` (pathnames; null: none). The run screen comes up as a
 * cover and goes down as one; deeper pushes, shallower pops; a sibling detail pushes; tabs and
 * the same page do not move, nor does a move from one tab's pages to another's. `history` (browser back or forward) wins over depth: back always pops.
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
	// From one tab to a page of another (a slate's "shoot this" button): a change of tab, not a
	// push or a pop. Nothing slides, and the navigation does not move under the page.
	const ta = tabOf(a);
	const tb = tabOf(b);
	if (ta && tb && ta !== tb) return 'none';
	const da = depth(a);
	const db = depth(b);
	if (da === 0 && db === 0) return 'none';
	if (history) return history === 'back' ? 'pop' : 'push';
	if (db > da) return 'push';
	if (db < da) return 'pop';
	return da === 0 ? 'none' : 'push';
}
