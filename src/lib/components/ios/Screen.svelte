<script lang="ts">
	// A screen: the page on a phone, a centred 430 px column on a desktop. One scroll container
	// (NavBar reads its scroll), safe areas left, right and below, and an accessory slot under the
	// scroll (the mini player, a toolbar). Sheets and action sheets portal into it, so a theme forced
	// on it reaches them too.
	import type { Snippet } from 'svelte';
	import { setScreen } from './layer.svelte';

	let {
		children,
		accessory,
		class: cls = '',
		scroller = $bindable(null)
	}: { children: Snippet; accessory?: Snippet; class?: string; scroller?: HTMLElement | null } = $props();

	let el = $state<HTMLElement | null>(null);
	let scrollY = $state(0);
	setScreen({
		get scrollY() {
			return scrollY;
		},
		get el() {
			return el;
		}
	});
</script>

<div class="ios-screen-host">
	<div class="ios-screen {cls}" data-ios-screen bind:this={el}>
		<div class="ios-scroll" bind:this={scroller} onscroll={(e) => (scrollY = (e.currentTarget as HTMLElement).scrollTop)}>
			{@render children()}
		</div>
		{#if accessory}<div class="ios-accessory">{@render accessory()}</div>{/if}
	</div>
</div>

<style>
	.ios-screen-host {
		min-height: var(--app-height, 100dvh);
		background: var(--bg);
	}
	.ios-screen {
		position: relative;
		display: flex;
		flex-direction: column;
		height: var(--app-height, 100dvh);
		max-width: 430px;
		margin: 0 auto;
		background: var(--bg);
		color: var(--label);
		overflow: hidden;
		padding-left: env(safe-area-inset-left);
		padding-right: env(safe-area-inset-right);
	}
	.ios-scroll {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		-webkit-overflow-scrolling: touch;
		padding-bottom: var(--tabbar-space, 0px);
	}
	.ios-accessory {
		flex: none;
		position: relative;
		z-index: 30;
	}
	@media (min-width: 600px) {
		.ios-screen-host {
			background: color-mix(in srgb, var(--bg) 88%, var(--label) 12%);
		}
	}
</style>
