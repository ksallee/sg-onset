<script lang="ts">
	// A page of the app on an iPad: one scroll that fills what the NavShell leaves (the whole
	// window outside one), its content a centred column of readable width. Like Screen, it is what
	// NavBar reads the scroll from. Sheets opened from it land on the shell, so they cover the
	// navigation too. `width` is the column: `form` (560 px: sign-in, a first run), `readable`
	// (720 px: a list, a detail), `columns` (1080 px: two columns of sections side by side, with
	// Columns) or `full` (a table, a grid). From 700 px of room the margins grow to an iPad's and
	// the large title lines up with the text of the rows; under it the page is the phone column.
	import type { Snippet } from 'svelte';
	import { getScreen, setScreen } from './layer.svelte';

	let {
		children,
		accessory,
		width = 'readable',
		class: cls = '',
		scroller = $bindable(null)
	}: { children: Snippet; accessory?: Snippet; width?: 'form' | 'readable' | 'columns' | 'full'; class?: string; scroller?: HTMLElement | null } = $props();

	const outer = getScreen();
	let el = $state<HTMLElement | null>(null);
	let scrollY = $state(0);
	setScreen({
		get scrollY() {
			return scrollY;
		},
		get el() {
			return outer?.el ?? el;
		}
	});
</script>

<div class="ios-page {cls}" data-width={width} data-ios-screen={outer ? undefined : ''} bind:this={el}>
	<div class="ios-page-scroll" bind:this={scroller} onscroll={(e) => (scrollY = (e.currentTarget as HTMLElement).scrollTop)}>
		{@render children()}
	</div>
	{#if accessory}<div class="ios-page-accessory">{@render accessory()}</div>{/if}
</div>

<style>
	.ios-page {
		--page-w: 720px;
		position: relative;
		display: flex;
		flex-direction: column;
		height: var(--app-height, 100dvh);
		background: var(--bg);
		color: var(--label);
		overflow: hidden;
	}
	.ios-page[data-width='form'] {
		--page-w: 560px;
	}
	.ios-page[data-width='columns'] {
		--page-w: 1080px;
	}
	.ios-page[data-width='full'] {
		--page-w: none;
	}
	.ios-page-scroll {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		-webkit-overflow-scrolling: touch;
		padding-bottom: calc(24px + var(--safe-bottom));
		container: ios-page / inline-size;
	}
	/* An iPad's margins, and the large title in line with the text of the rows. */
	@container ios-page (min-width: 700px) {
		.ios-page-scroll > :global(*) {
			--page-margin: 24px;
			--title-inset: 16px;
		}
		.ios-page-scroll > :global(.large-title) {
			margin-top: 12px;
			margin-bottom: 12px;
		}
	}
	/* The column. The bar spans the page: it holds its own content to the column (NavBar). */
	.ios-page-scroll > :global(*) {
		width: 100%;
		max-width: var(--page-w);
		margin-left: auto;
		margin-right: auto;
	}
	.ios-page-scroll > :global(.ios-navbar) {
		max-width: none;
	}
	.ios-page-accessory {
		flex: none;
		position: relative;
		z-index: 30;
	}
</style>
