<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { provideApp } from '$lib/app/app.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { navDirection } from '$lib/ios/direction';

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

	// The theme, the holding hand and the target sizes, from the settings (lib/app).
	onMount(() => settings.start());
</script>

<!-- A touchstart listener anywhere lets iOS Safari apply :active press states. -->
<svelte:window ontouchstart={() => {}} />
{#if app}{@render children()}{/if}
