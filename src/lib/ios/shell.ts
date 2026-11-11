// Where the navigation of a NavShell sits, by the hand that holds the device and the room there
// is. Pure. The action rail of a Workspace is on the holding hand's edge and, in a narrow window,
// along the foot: the navigation never goes there. Wide: a sidebar on the far side edge, under the
// other thumb. Narrower: a bar across the top, its tabs starting at the far corner.

import { WIDE_FROM, type Hand } from './handedness';

/** The sidebar: full, with words, or a strip of icons. */
export const SIDEBAR_W = 248;
export const STRIP_W = 80;

export interface ShellLayout {
	/** A sidebar on a side edge, or a bar across the top. */
	nav: 'side' | 'top';
	/** The edge the sidebar is on, and the corner the tabs of a top bar start from: away from the holding hand. */
	edge: 'left' | 'right';
	/** Icons only. A top bar is never a strip. */
	strip: boolean;
	/** The width the navigation takes from the content, px. A top bar takes none. */
	taken: number;
}

/**
 * `strip`: the person collapsed the sidebar. `focus`: the page needs the room (the take screen),
 * so the sidebar is a strip whatever the person chose.
 */
export function shellLayout(hand: Hand, width: number, options: { strip?: boolean; focus?: boolean } = {}): ShellLayout {
	const edge = hand === 'right' ? 'left' : 'right';
	if (width < WIDE_FROM) return { nav: 'top', edge, strip: false, taken: 0 };
	const strip = !!options.strip || !!options.focus;
	return { nav: 'side', edge, strip, taken: strip ? STRIP_W : SIDEBAR_W };
}
