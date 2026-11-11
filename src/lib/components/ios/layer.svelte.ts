// What the iOS primitives share at run time: the screen they sit in (its scroll, its element, so
// overlays land inside it and keep its theme), the stack of open overlays (only the top one takes
// Escape and Tab; the one under it scales back), the sheet a SheetPage drills into, reduced motion.

import { getContext, setContext } from 'svelte';
import { trapStep } from '$lib/ios/keys';

// ---------------------------------------------------------------- screen

export interface ScreenContext {
	readonly scrollY: number;
	readonly el: HTMLElement | null;
}
const SCREEN = Symbol('ios-screen');
export const setScreen = (ctx: ScreenContext) => setContext(SCREEN, ctx);
export const getScreen = (): ScreenContext | undefined => getContext(SCREEN);

/** Moves an overlay to the screen element (or the body), out of any transformed or clipping parent. */
export function portal(target: () => HTMLElement | null | undefined) {
	return (node: HTMLElement) => {
		const to = target() ?? document.querySelector<HTMLElement>('[data-ios-screen]') ?? document.body;
		to.appendChild(node);
		return () => node.remove();
	};
}

// ---------------------------------------------------------------- the overlay stack

class Stack {
	ids = $state<number[]>([]);
	#next = 1;
	open(): number {
		const id = this.#next++;
		this.ids = [...this.ids, id];
		return id;
	}
	close(id: number) {
		this.ids = this.ids.filter((x) => x !== id);
	}
	top(id: number): boolean {
		return this.ids[this.ids.length - 1] === id;
	}
	/** How many overlays are open over this one. */
	above(id: number): number {
		const i = this.ids.indexOf(id);
		return i < 0 ? 0 : this.ids.length - 1 - i;
	}
}
export const overlays = new Stack();

// ---------------------------------------------------------------- sheet pages

export interface SheetContext {
	/** The sheet's panel: SheetPages portal into it. */
	readonly panel: HTMLElement | null;
	/** What a drill-in's back button says: the sheet's or the page's title. */
	readonly backLabel: string;
	/** Open drill-ins, innermost last: Escape closes the last first. */
	pages: (() => void)[];
}
const SHEET = Symbol('ios-sheet');
export const setSheet = (ctx: SheetContext) => setContext(SHEET, ctx);
export const getSheet = (): SheetContext | undefined => getContext(SHEET);

// ---------------------------------------------------------------- focus

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `el` (keys.ts trapStep). Call from a keydown handler; true if it moved focus. */
export function trapTab(e: KeyboardEvent, el: HTMLElement): boolean {
	const list = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null && !n.closest('[inert]'));
	const to = trapStep(list.length, list.indexOf(document.activeElement as HTMLElement), e.shiftKey);
	if (to === null) return false;
	e.preventDefault();
	(to < 0 ? el : list[to]).focus();
	return true;
}

/** Focus into `el` on open; back to what had it, on close (the returned function). */
export function holdFocus(el: HTMLElement): () => void {
	const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	requestAnimationFrame(() => {
		if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
	});
	return () => {
		if (opener && opener.isConnected) opener.focus({ preventScroll: true });
	};
}

// ---------------------------------------------------------------- motion

/**
 * Whether motion is reduced: `data-motion` on <html> (the Motion setting, resolved; app.html sets
 * it before the first paint), else what the device asks.
 */
export function reducedMotion(): boolean {
	const set = typeof document === 'undefined' ? undefined : document.documentElement.dataset.motion;
	if (set === 'reduced' || set === 'full') return set === 'reduced';
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
