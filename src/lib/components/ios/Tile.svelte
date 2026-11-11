<script lang="ts">
	// A row's leading icon tile: 29 × 29, radius 7, a glyph in --on-tint on a colour, the tint by default (Settings style).
	import type { Component } from 'svelte';
	let { icon: Icon, color = 'var(--tint)' }: { icon: Component<{ class?: string; strokeWidth?: number }>; color?: string } = $props();
</script>

<span class="ios-tile" style:background={color} aria-hidden="true"><Icon class="size-[18px]" strokeWidth={2.2} /></span>

<style>
	.ios-tile {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 29px;
		height: 29px;
		border-radius: 7px;
		color: var(--on-tint);
	}
	/* Night fills nothing brightly: whatever its colour, a dim slab, a red glyph and a ring. */
	:global([data-night='true']) .ios-tile,
	:global(.ios-night) .ios-tile {
		background: var(--tint-solid) !important;
		color: var(--on-tint-solid);
		box-shadow: inset 0 0 0 calc(var(--state-ring) / 2) var(--on-tint-solid);
	}
</style>
