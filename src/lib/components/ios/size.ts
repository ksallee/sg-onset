// The room an element has, for a layout that follows it (#99). `bind:clientWidth` reads the size
// inside its ResizeObserver's callback, and the state it sets lays the page out again there. When
// a style sheet is still loading (an in-app navigation can draw a page before its styles land),
// WebKit answers a read of a size with a layout of its own: the element changes size inside its
// observer's report and WebKit throws "ResizeObserver loop completed with undelivered
// notifications". Here the callback only asks for the next frame; the size is read and set there.
import { untrack } from 'svelte';

/**
 * `<div {@attach clientSize((w) => (width = w))}>`: `set` gets the element's clientWidth and
 * clientHeight now, then on the frame after each change of size. Never inside the observer.
 */
export function clientSize(set: (width: number, height: number) => void) {
	return (node: HTMLElement) => {
		untrack(() => set(node.clientWidth, node.clientHeight));
		if (typeof ResizeObserver === 'undefined') return;
		let frame = 0;
		const sizes = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => set(node.clientWidth, node.clientHeight));
		});
		sizes.observe(node);
		return () => {
			cancelAnimationFrame(frame);
			sizes.disconnect();
		};
	};
}
