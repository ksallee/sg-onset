<script lang="ts">
	// A chip: a short value to pick with one tap. 44 px tall. `on`: it is the current one.
	import type { Snippet } from 'svelte';
	let { on = false, label, onclick, children }: { on?: boolean; label?: string; onclick: () => void; children: Snippet } = $props();
</script>

<button type="button" class="ios-chip num" class:on aria-label={label} aria-pressed={on} {onclick}>{@render children()}</button>

<style>
	.ios-chip {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		height: 44px;
		padding: 0 12px;
		border-radius: 12px;
		background: var(--fill-3);
		color: var(--label);
		font-family: var(--font-rounded);
		font-size: 19px;
		font-weight: 600;
		white-space: nowrap;
	}
	.ios-chip.on {
		box-shadow: inset 0 0 0 2px var(--tint);
	}
	.ios-chip:active {
		background: var(--label);
		color: var(--bg);
	}
	.ios-chip:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: 2px;
	}
</style>
