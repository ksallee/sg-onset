<script lang="ts">
	// The bottom toolbar: bar material, a top hairline, safe-area padding; its items spread across.
	// Put it in Screen's `accessory`. Items are plain tinted buttons (Button variant plain), the
	// main action may be filled.
	import type { Snippet } from 'svelte';
	let { children, label = 'Toolbar' }: { children: Snippet; label?: string } = $props();
</script>

<div class="ios-toolbar material-bar" role="toolbar" aria-label={label}>
	{@render children()}
</div>

<style>
	.ios-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 49px;
		padding: 0 16px var(--safe-bottom) 8px;
		box-shadow: 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
</style>
