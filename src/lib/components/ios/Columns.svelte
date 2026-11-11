<script lang="ts">
	// Sections side by side on an iPad: each child element is a column. With 860 px of room in the
	// Page there are two columns; with less they stack, in order. Use in a Page of width `columns`.
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="ios-columns">{@render children()}</div>

<style>
	.ios-columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}
	@container ios-page (min-width: 860px) {
		.ios-columns {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
			/* The sections keep their own margins: the gutter is the two of them. */
			column-gap: 0;
		}
		.ios-columns > :global(:first-child) {
			margin-right: calc(var(--page-margin, 16px) / -2);
		}
		.ios-columns > :global(:last-child) {
			margin-left: calc(var(--page-margin, 16px) / -2);
		}
	}
</style>
