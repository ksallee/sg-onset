<script lang="ts">
	// One of a few, picked with a tap: the kit's Segmented at full touch height. Every option is
	// `--touch` tall (44 px, 56 px at the large button size) and as wide as its share of the row,
	// so it is a real target under a thumb or a glove. Same radio group as the kit: one Tab stop,
	// arrows move and pick (ios/keys.ts). A long label wraps; it is never cut.
	import { radioStep } from '$lib/ios/keys';
	import type { Option } from '$lib/ios/option';

	let { options, value, onchange, label }: { options: readonly Option[]; value: string | undefined; onchange: (value: string) => void; label: string } = $props();

	let group = $state<HTMLElement | null>(null);
	const at = $derived(options.findIndex((o) => o.value === value));
	const stop = $derived(at >= 0 ? at : 0);

	function pick(to: string) {
		if (to !== value) onchange(to);
	}
	function key(e: KeyboardEvent, i: number) {
		const to = radioStep(e.key, i, options.map(() => true));
		if (to === null) return;
		e.preventDefault();
		group?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
		pick(options[to].value);
	}
</script>

<div class="choice" role="radiogroup" aria-label={label} bind:this={group} style:--n={options.length}>
	{#if at >= 0}<span class="thumb" aria-hidden="true" style:transform="translateX({at * 100}%)"></span>{/if}
	{#each options as o, i (o.value)}
		<button type="button" role="radio" aria-checked={o.value === value} tabindex={i === stop ? 0 : -1} class:on={o.value === value} onclick={() => pick(o.value)} onkeydown={(e) => key(e, i)}>
			<span>{o.label}</span>
		</button>
	{/each}
</div>

<style>
	.choice {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		padding: 3px;
		border-radius: 13px;
		background: var(--fill-3);
		isolation: isolate;
	}
	.thumb {
		position: absolute;
		z-index: 0;
		top: 3px;
		bottom: 3px;
		left: 3px;
		width: calc((100% - 6px) / var(--n));
		border-radius: 10px;
		background: var(--segment-thumb);
		box-shadow:
			0 3px 8px rgb(0 0 0 / 0.12),
			0 1px 1px rgb(0 0 0 / 0.06),
			0 0 0 var(--hairline) var(--separator);
		transition: transform var(--dur-control) var(--ease-ios);
	}
	button {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		/* The group's 3 px of padding is part of the target: the box itself is the full height. */
		min-height: max(44px, var(--touch, 44px));
		margin: -3px 0;
		padding: 4px 6px;
		border-radius: 10px;
		font-size: 15px;
		line-height: 18px;
		font-weight: 500;
		letter-spacing: -0.23px;
		color: var(--label-2);
		touch-action: manipulation;
		-webkit-user-select: none;
		user-select: none;
		transition: color var(--dur-control);
	}
	button span {
		text-align: center;
		overflow-wrap: anywhere;
		transition: transform var(--dur-press) ease-out;
	}
	button.on {
		font-weight: 600;
		color: var(--label);
	}
	button:active:not(.on) span {
		transform: scale(0.96);
		opacity: 0.6;
	}
	button:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: -4px;
	}
</style>
