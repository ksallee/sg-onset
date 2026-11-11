// The large title as the page scrolls, pure: NavBar reads the scroll, this gives the progress.

/** Height of the large-title block (34/41 type plus padding), px: it is under the bar past this. */
export const LARGE_TITLE_H = 52;

/** 0: the large title shows in full; 1: it has scrolled under the bar, the inline title shows. */
export function titleProgress(scrollY: number): number {
	return Math.max(0, Math.min(1, scrollY / LARGE_TITLE_H));
}

/** The bar takes its material once content is under it: at once, or past the large title. */
export function barScrolled(scrollY: number, large = false): boolean {
	return large ? scrollY >= LARGE_TITLE_H : scrollY > 0;
}
