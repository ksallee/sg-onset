<script lang="ts">
	// The iOS search field: a magnifier, 17 px text (no zoom on focus), a clear button once there
	// is text, Cancel beside it while focused or filled. Cancel clears, blurs and calls `oncancel`.
	import { Search, CircleX } from '@lucide/svelte';

	let {
		value = $bindable(''),
		placeholder = 'Search',
		oncancel,
		onsubmit,
		label
	}: { value?: string; placeholder?: string; oncancel?: () => void; onsubmit?: (value: string) => void; label?: string } = $props();

	let input = $state<HTMLInputElement | null>(null);
	let focused = $state(false);
	const active = $derived(focused || value !== '');

	function cancel() {
		value = '';
		input?.blur();
		focused = false;
		oncancel?.();
	}
</script>

<form
	class="ios-search"
	role="search"
	onsubmit={(e) => {
		e.preventDefault();
		input?.blur();
		onsubmit?.(value);
	}}
>
	<div class="box">
		<Search class="size-[17px] shrink-0" strokeWidth={2.3} aria-hidden="true" />
		<input
			bind:this={input}
			bind:value
			type="search"
			enterkeyhint="search"
			autocomplete="off"
			autocorrect="off"
			spellcheck="false"
			aria-label={label ?? placeholder}
			{placeholder}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
		/>
		{#if value}
			<button
				type="button"
				class="clear"
				aria-label="Clear"
				onpointerdown={(e) => e.preventDefault()}
				onclick={() => {
					value = '';
					input?.focus();
				}}><CircleX class="size-[17px]" fill="currentColor" stroke="var(--cell-elevated)" /></button
			>
		{/if}
	</div>
	<button type="button" class="cancel" class:shown={active} tabindex={active ? 0 : -1} aria-hidden={!active} onclick={cancel}>Cancel</button>
</form>

<style>
	.ios-search {
		display: flex;
		align-items: center;
		padding: 0 16px;
		overflow: hidden;
	}
	.box {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 6px 0 8px;
		border-radius: 10px;
		background: var(--fill-3);
		color: var(--label-2);
	}
	input {
		flex: 1;
		min-width: 0;
		height: 36px;
		border: 0;
		background: transparent;
		color: var(--label);
		font-size: 17px;
		letter-spacing: -0.43px;
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}
	input::placeholder {
		color: var(--label-2);
	}
	input::-webkit-search-cancel-button {
		display: none;
	}
	.clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 36px;
		color: var(--label-2);
	}
	.cancel {
		flex: none;
		height: 44px;
		max-width: 0;
		padding: 0;
		overflow: hidden;
		color: var(--tint);
		font-size: 17px;
		letter-spacing: -0.43px;
		opacity: 0;
		transition: max-width var(--dur-reveal) var(--ease-ios), padding var(--dur-reveal) var(--ease-ios), opacity var(--dur-reveal);
	}
	.cancel.shown {
		max-width: 80px;
		padding-left: 12px;
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.cancel {
			transition: opacity 150ms;
		}
	}
</style>
