<script lang="ts">
	// The iOS slider: a 4 px track filled in tint up to a white 28 px thumb, a 44 px target; icons
	// or words at either end (`leading`, `trailing`). A native range input: keys and assistive tech
	// come with it. `onchange` follows the drag.
	import type { Snippet } from 'svelte';

	let {
		value,
		min = 0,
		max = 1,
		step = 0.01,
		onchange,
		leading,
		trailing,
		label,
		format
	}: { value: number; min?: number; max?: number; step?: number; onchange: (value: number) => void; leading?: Snippet; trailing?: Snippet; label: string; format?: (v: number) => string } = $props();

	const p = $derived(max > min ? ((value - min) / (max - min)) * 100 : 0);
</script>

<div class="ios-slider">
	{#if leading}<span class="end">{@render leading()}</span>{/if}
	<input type="range" {min} {max} {step} {value} aria-label={label} aria-valuetext={format?.(value)} style:--p="{p}%" oninput={(e) => onchange(Number((e.currentTarget as HTMLInputElement).value))} />
	{#if trailing}<span class="end">{@render trailing()}</span>{/if}
</div>

<style>
	.ios-slider {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		width: 100%;
	}
	.end {
		flex: none;
		display: flex;
		align-items: center;
		color: var(--label-2);
	}
	input {
		flex: 1;
		min-width: 0;
		height: 44px;
		margin: 0;
		background: transparent;
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
		touch-action: pan-y;
	}
	input::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--tint) var(--p), var(--fill) var(--p));
	}
	input::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--tint) var(--p), var(--fill) var(--p));
	}
	input::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 28px;
		height: 28px;
		margin-top: -12px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0.5px 4px rgb(0 0 0 / 0.12), 0 6px 13px rgb(0 0 0 / 0.12);
		transition: transform var(--dur-press);
	}
	input::-moz-range-thumb {
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0.5px 4px rgb(0 0 0 / 0.12), 0 6px 13px rgb(0 0 0 / 0.12);
	}
	input:active::-webkit-slider-thumb {
		transform: scale(1.08);
		transition: none;
	}
	input:focus-visible {
		outline: none;
	}
	input:focus-visible::-webkit-slider-thumb {
		box-shadow: 0 0 0 3px var(--tint);
	}
</style>
