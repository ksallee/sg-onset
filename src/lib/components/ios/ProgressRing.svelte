<script lang="ts">
	// A progress ring, as Apple Fitness draws it: a faint full track, a round-capped arc from the
	// top. `children` goes in the middle ("3 of 6").
	import type { Snippet } from 'svelte';
	let {
		value,
		size = 64,
		stroke,
		color = 'var(--tint)',
		label = 'Progress',
		children
	}: { value: number; size?: number; stroke?: number; color?: string; label?: string; children?: Snippet } = $props();

	const w = $derived(stroke ?? Math.max(4, Math.round(size / 9)));
	const r = $derived((size - w) / 2);
	const c = $derived(2 * Math.PI * r);
	const v = $derived(Math.max(0, Math.min(1, value)));
</script>

<div class="ios-ring" style:width="{size}px" style:height="{size}px" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
	<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
		<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={color} stroke-opacity="0.22" stroke-width={w} />
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke={color}
			stroke-width={w}
			stroke-linecap="round"
			stroke-dasharray={c}
			stroke-dashoffset={c * (1 - v)}
			transform="rotate(-90 {size / 2} {size / 2})"
			class="arc"
		/>
	</svg>
	{#if children}<div class="mid">{@render children()}</div>{/if}
</div>

<style>
	.ios-ring {
		position: relative;
		flex: none;
	}
	.arc {
		transition: stroke-dashoffset 600ms var(--ease-ios);
	}
	.mid {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	@media (prefers-reduced-motion: reduce) {
		.arc {
			transition: none;
		}
	}
</style>
