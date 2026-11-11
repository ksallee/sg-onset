<script lang="ts">
	// The iOS 17 segmented control: a rounded rect on fill, a raised thumb that slides to the
	// picked option. `ghost` draws the thumb quietly (the value is inherited, not set here; tapping
	// any option sets it). A radio group: one Tab stop (the checked option); arrows, Home and End
	// move and pick (ios/keys.ts radioStep).
	// Motion (docs/design/motion.md): the thumb slides on the snappy spring, as a transition, so
	// a second pick turns it from where it is; pressed on the picked option, it gives a little.
	import type { Option } from '$lib/ios/option';
	import { radioStep } from '$lib/ios/keys';

	let {
		options,
		value,
		onchange,
		ghost = false,
		small = false,
		label
	}: { options: readonly Option[]; value: string | undefined; onchange: (value: string) => void; ghost?: boolean; small?: boolean; label: string } = $props();

	let group = $state<HTMLElement | null>(null);
	const at = $derived(options.findIndex((o) => o.value === value));
	const stop = $derived(at >= 0 && !options[at].disabled ? at : options.findIndex((o) => !o.disabled));

	function key(e: KeyboardEvent, i: number) {
		const to = radioStep(e.key, i, options.map((o) => !o.disabled));
		if (to === null) return;
		e.preventDefault();
		group?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
		if (options[to].value !== value) onchange(options[to].value);
	}
</script>

<div class="ios-seg" class:ghost class:small role="radiogroup" aria-label={label} bind:this={group} style:--n={options.length}>
	{#if at >= 0}<span class="thumb" aria-hidden="true" style:transform="translateX({at * 100}%)"></span>{/if}
	{#each options as o, i (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={o.value === value}
			tabindex={i === stop ? 0 : -1}
			class:on={o.value === value}
			class:after-on={i === at + 1}
			disabled={o.disabled}
			onclick={() => onchange(o.value)}
			onkeydown={(e) => key(e, i)}
		>
			<span>{o.label}</span>
		</button>
	{/each}
</div>

<style>
	.ios-seg {
		position: relative;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		height: 32px;
		padding: 2px;
		border-radius: 9px;
		background: var(--fill-3);
		isolation: isolate;
	}
	.ios-seg.small {
		display: inline-grid;
		height: 28px;
		border-radius: 8px;
	}
	.thumb {
		position: absolute;
		z-index: 0;
		top: 2px;
		bottom: 2px;
		left: 2px;
		width: calc((100% - 4px) / var(--n));
		border-radius: 7px;
		background: var(--segment-thumb);
		box-shadow: var(--shadow-1);
		/* Night: no shadow to lift it, so a ring. */
		outline: var(--state-ring) solid var(--label-2);
		outline-offset: -2px;
		transition: transform var(--dur-snappy) var(--spring-snappy), scale var(--dur-press) var(--ease-out);
	}
	.ios-seg:has(button.on:active) .thumb {
		scale: 0.96;
		transition: transform var(--dur-snappy) var(--spring-snappy), scale 0s;
	}
	.ghost .thumb {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--label-3);
	}
	button {
		position: relative;
		z-index: 1;
		min-width: 0;
		padding: 0 8px;
		font-size: 13px;
		line-height: 18px;
		font-weight: 500;
		letter-spacing: -0.08px;
		color: var(--label);
	}
	.small button {
		padding: 0 10px;
	}
	button span {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	button.on {
		font-weight: 600;
	}
	.ghost button.on {
		font-weight: 500;
		color: var(--label-2);
	}
	/* Hairline dividers between options, hidden next to the thumb. */
	button + button::before {
		content: '';
		position: absolute;
		left: 0;
		top: 7px;
		bottom: 7px;
		width: 1px;
		background: var(--separator);
		transition: opacity var(--dur-fade);
	}
	button.on::before,
	button.after-on::before {
		opacity: 0;
	}
	/* A 44 px target on a 32 px control. */
	button::after {
		content: '';
		position: absolute;
		inset: -6px 0;
	}
	button:disabled {
		color: var(--label-3);
	}
	button:active:not(:disabled):not(.on) span {
		opacity: 0.5;
	}
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -1px;
		border-radius: 7px;
	}
</style>
