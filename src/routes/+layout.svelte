<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate, beforeNavigate, onNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { provideApp } from '$lib/app/app.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { activeNav } from '$lib/app/nav';
	import { reducedMotion } from '$lib/components/ios/layer.svelte';
	import { arrive, leave } from '$lib/components/ios/pageStage';
	import { navDirection, pageMotion } from '$lib/ios/direction';

	let { children } = $props();

	// The store, opened once, for every page (lib/app). Nothing opens on the server.
	const app = provideApp();

	// A new deploy is out (polled, see vite.config.ts): the next in-app navigation loads it in
	// full, so an open app never keeps the old version or asks for files the deploy removed.
	beforeNavigate((nav) => {
		if (!updated.current || nav.willUnload || !nav.to) return;
		nav.cancel();
		location.href = nav.to.url.href;
	});

	// A change of page moves (docs/design/motion.md): a push or a pop inside a destination, a fade
	// between destinations, nothing to or from the capture path. The direction is from the routes
	// (ios/direction.ts); the stage moves the pages (ios/pageStage.ts). Nothing here waits: the
	// picture of the old page is taken, the new page mounts, then the two move.
	onNavigate((nav) => {
		const from = nav.from?.url.pathname ?? null;
		const to = nav.to?.url.pathname ?? null;
		const history = nav.type === 'popstate' && nav.delta ? (nav.delta < 0 ? 'back' : 'forward') : undefined;
		const focus = !!(from && activeNav(from)?.focus) || !!(to && activeNav(to)?.focus);
		// iPadOS moves the page itself on a swipe from a side edge: moving it again shows it twice.
		const swiped = nav.type === 'popstate' && performance.now() - edgeTouch < 1000;
		leave(pageMotion(navDirection(from, to, history), { reduced: reducedMotion(), focus, swiped }));
	});
	afterNavigate(() => arrive());

	/** When a finger last came down within reach of a side edge, ms. */
	let edgeTouch = -Infinity;
	function touched(event: TouchEvent) {
		const x = event.touches[0]?.clientX ?? NaN;
		if (x < 28 || x > window.innerWidth - 28) edgeTouch = performance.now();
	}

	// The theme, the holding hand and the target sizes, from the settings (lib/app).
	onMount(() => settings.start());
</script>

<!-- A touchstart listener anywhere lets iOS Safari apply :active press states. -->
<svelte:window ontouchstart={touched} />
<div data-root-stage>{#if app}{@render children()}{/if}</div>
