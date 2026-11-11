<script lang="ts">
	// A row's leading icon tile: 29 × 29, radius 7, white glyph on a colour (Settings style).
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
		color: #fff;
	}
</style>
