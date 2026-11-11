<script lang="ts">
	// A row of a Section that is typed into: the label on the left, the text on the right, as in
	// iOS Settings. `value` is bound as it is typed; `onchange` fires when the field is left or
	// Return is pressed, with the text trimmed: save there. `invalid` marks it and `error` says
	// why, under the row.
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		label,
		value = $bindable(''),
		onchange,
		invalid = false,
		error,
		class: cls = '',
		...rest
	}: {
		label: string;
		value?: string;
		onchange?: (value: string) => void;
		invalid?: boolean;
		error?: string;
		class?: string;
	} & Omit<HTMLInputAttributes, 'value' | 'onchange' | 'class'> = $props();

	const id = $props.id();
	// What the field held when it was entered: leaving it unchanged saves nothing.
	let committed = '';

	function commit() {
		const text = value.trim();
		if (text === committed) return;
		committed = text;
		onchange?.(text);
	}
</script>

<div class="ios-input-row {cls}" class:invalid={invalid || !!error} role="listitem">
	<label class="cell" for={id}>
		<span class="label">{label}</span>
		<input
			{id}
			type="text"
			autocomplete="off"
			autocapitalize="sentences"
			spellcheck="false"
			aria-invalid={invalid || !!error || undefined}
			aria-describedby={error ? `${id}-error` : undefined}
			{...rest}
			bind:value
			onfocus={() => (committed = value.trim())}
			onblur={commit}
			onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
		/>
	</label>
	{#if error}<p class="error" id="{id}-error" role="alert">{error}</p>{/if}
</div>

<style>
	.ios-input-row {
		position: relative;
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.ios-input-row:last-child {
		box-shadow: none;
	}
	.cell {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: var(--touch, 44px);
		padding: 0 16px;
	}
	.label {
		flex: none;
		width: 34%;
		max-width: 160px;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	input {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		min-height: var(--touch, 44px);
		background: transparent;
		color: var(--label);
		font-size: 17px;
		letter-spacing: -0.43px;
		text-align: left;
		outline: none;
	}
	input::placeholder {
		color: var(--label-3);
	}
	input:disabled {
		color: var(--label-2);
	}
	.cell:focus-within .label {
		color: var(--tint);
	}
	.invalid .label {
		color: var(--destructive);
	}
	.error {
		padding: 0 16px 10px;
		font-size: 13px;
		line-height: 18px;
		color: var(--destructive);
	}
</style>
