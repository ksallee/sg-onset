<script lang="ts">
	// Two columns of a Page that follow the holding hand. `main` holds what the person acts on:
	// with 860 px of page it sits on the side of the holding hand, under its thumb, and `before`
	// and `after` stack in the other column. With less room everything is one column, in the
	// order before, main, after. Use in a Page of width `columns`, in place of the kit's Columns
	// when the side matters.
	import type { Snippet } from 'svelte';
	import type { Hand } from '$lib/ios/handedness';

	let { hand, before, main, after }: { hand: Hand; before?: Snippet; main: Snippet; after?: Snippet } = $props();
</script>

<div class="side-columns" data-side={hand}>
	{#if before}<div class="before">{@render before()}</div>{/if}
	<div class="main">{@render main()}</div>
	{#if after}<div class="after">{@render after()}</div>{/if}
</div>

<style>
	.side-columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'before' 'main' 'after';
	}
	.before {
		grid-area: before;
	}
	.main {
		grid-area: main;
	}
	.after {
		grid-area: after;
	}
	.side-columns > div {
		min-width: 0;
	}
	@container ios-page (min-width: 860px) {
		.side-columns {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-template-rows: auto 1fr;
			grid-template-areas: 'before main' 'after main';
			align-items: start;
		}
		.side-columns[data-side='left'] {
			grid-template-areas: 'main before' 'main after';
		}
		/* The sections keep their own margins: the gutter is the two of them, halved. */
		.side-columns[data-side='right'] > .main,
		.side-columns[data-side='left'] > :not(.main) {
			margin-left: calc(var(--page-margin, 16px) / -2);
		}
		.side-columns[data-side='left'] > .main,
		.side-columns[data-side='right'] > :not(.main) {
			margin-right: calc(var(--page-margin, 16px) / -2);
		}
	}
</style>
