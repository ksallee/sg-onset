// Where a drawing's overlays land: on the app's outermost screen, over the navigation, as a page's
// sheets do. On Shoot the Workspace is a screen of its own, under the navigation; a drawing opened
// there must still cover everything, and the sheet it asks with must sit over it. Call while the
// component that opens the drawing initialises: the cover and its sheets read it.

import { setScreen } from '$lib/components/ios/layer.svelte';

export function coverScreen(): void {
	setScreen({
		scrollY: 0,
		get el() {
			return typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-ios-screen]');
		}
	});
}
