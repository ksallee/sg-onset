// Which way a navigation moves, pure: the root layout asks, components/ios/pageStage.ts moves.

export type NavDirection = 'push' | 'pop' | 'cover' | 'uncover' | 'fade' | 'none';

/** The tab roots: moving between them fades, never slides. */
export const TAB_ROOTS = ['/', '/shoot', '/slates', '/gear', '/templates', '/settings'];

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
 * cover and goes down as one; deeper pushes, shallower pops; a sibling detail pushes; a change of
 * tab fades, from any page of one to any page of another; the same page does not move.
 * `history` (browser back or forward) wins over depth: back always pops.
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
	// push or a pop. Nothing slides: the sidebar may change width under the page.
	const ta = tabOf(a);
	const tb = tabOf(b);
	if (ta && tb && ta !== tb) return 'fade';
	const da = depth(a);
	const db = depth(b);
	if (da === 0 && db === 0) return 'fade';
	if (history) return history === 'back' ? 'pop' : 'push';
	if (db > da) return 'push';
	if (db < da) return 'pop';
	return 'push';
}

/**
 * The motion a navigation gets, from its direction and what is going on. Reduced motion: every
 * move is a fade. `focus` (to or from the capture path): no fade, the page is there on the first
 * frame. `swiped`: the system's own back swipe just moved the page; moving it again would show
 * it twice.
 */
export function pageMotion(direction: NavDirection, when: { reduced?: boolean; focus?: boolean; swiped?: boolean } = {}): NavDirection {
	if (direction === 'none' || when.swiped) return 'none';
	if (when.focus && direction === 'fade') return 'none';
	if (when.reduced) return 'fade';
	return direction;
}
