<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { navDirection } from '$lib/ios/direction';
	import { appearance } from '$lib/ios/appearance.svelte';

	let { children } = $props();

	// A new deploy is out (polled, see vite.config.ts): the next in-app navigation loads it in
	// full, so an open app never keeps the old version or asks for files the deploy removed.
	beforeNavigate((nav) => {
		if (!updated.current || nav.willUnload || !nav.to) return;
		nav.cancel();
		location.href = nav.to.url.href;
	});

	// Push, pop and cover as View Transitions; the direction from the routes (ios/direction.ts),
	// the motion in app.css.
	onNavigate((nav) => {
		if (!document.startViewTransition) return;
		const history = nav.type === 'popstate' && nav.delta ? (nav.delta < 0 ? 'back' : 'forward') : undefined;
		const dir = navDirection(nav.from?.url.pathname ?? null, nav.to?.url.pathname ?? null, history);
		if (dir === 'none') return;
		return new Promise((resolve) => {
			const root = document.documentElement;
			root.dataset.nav = dir;
			const t = document.startViewTransition(async () => {
				resolve();
				await nav.complete;
			});
			t.finished.finally(() => delete root.dataset.nav);
		});
	});

	// The appearance; with System, it follows the device.
	onMount(() => appearance.start());
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<!-- A touchstart listener anywhere lets iOS Safari apply :active press states. -->
<svelte:window ontouchstart={() => {}} />
{@render children()}
