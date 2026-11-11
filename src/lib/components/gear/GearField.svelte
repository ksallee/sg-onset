<script lang="ts">
	// One typed field of a camera or a lens: the label left, the text right, the unit after it,
	// the problem under it. As the kit's InputRow, plus the unit. `value` is what is stored, as
	// text; the field shows it until the person types, and again when the stored value changes
	// (an undo). `oncommit(text)` on leaving the field or Return, only when the text changed.
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		label,
		value,
		unit,
		error,
		oncommit,
		onedit,
		...rest
	}: {
		label: string;
		value: string;
		unit?: string;
		error?: string;
		oncommit: (text: string) => void;
		/** Every keystroke: for a form that is saved as a whole (a new camera). */
		onedit?: (text: string) => void;
	} & Omit<HTMLInputAttributes, 'value' | 'class'> = $props();

	const id = $props.id();
	let text = $state('');
	let focused = $state(false);
	// The stored value moved under a field that is not being typed in: show it.
	$effect.pre(() => {
		const v = value;
		if (!focused) text = v;
	});

	function commit() {
		focused = false;
		const typed = text.trim();
		if (typed !== value.trim()) oncommit(typed);
		else text = value;
	}
</script>

<div class="gear-field" class:invalid={!!error} role="listitem">
	<label class="cell" for={id}>
		<span class="label">{label}</span>
		<input
			{id}
			type="text"
			autocomplete="off"
			spellcheck="false"
			aria-invalid={!!error || undefined}
			aria-describedby={error ? `${id}-error` : undefined}
			{...rest}
			bind:value={text}
			oninput={() => onedit?.(text)}
			onfocus={() => (focused = true)}
			onblur={commit}
			onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
		/>
		{#if unit}<span class="unit" aria-hidden="true">{unit}</span>{/if}
	</label>
	{#if error}<p class="error" id="{id}-error" role="alert">{error}</p>{/if}
</div>

<style>
	.gear-field {
		position: relative;
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.gear-field:last-child {
		box-shadow: none;
	}
	.cell {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: var(--touch, 44px);
		padding: 0 16px;
		cursor: text;
	}
	.label {
		flex: none;
		width: 38%;
		max-width: 190px;
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
		font-variant-numeric: tabular-nums;
		outline: none;
	}
	input::placeholder {
		color: var(--label-3);
	}
	.unit {
		flex: none;
		font-size: 17px;
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
