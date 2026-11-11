<script lang="ts">
	// The iOS switch, 51 × 31: an `<input type=checkbox switch>` (Safari 17.4+ gives it haptics),
	// drawn the same everywhere. A 44 px target. `label` names it for assistive tech.
	let { checked, onchange, disabled = false, label }: { checked: boolean; onchange: (checked: boolean) => void; disabled?: boolean; label: string } = $props();
	const attrs = { switch: true };
</script>

<label class="ios-toggle" class:disabled>
	<input type="checkbox" role="switch" {...attrs} {checked} {disabled} aria-label={label} aria-checked={checked} onchange={(e) => onchange((e.currentTarget as HTMLInputElement).checked)} />
</label>

<style>
	.ios-toggle {
		flex: none;
		position: relative;
		display: inline-flex;
		align-items: center;
		height: 44px;
	}
	input {
		appearance: none;
		-webkit-appearance: none;
		position: relative;
		width: 51px;
		height: 31px;
		margin: 0;
		border-radius: 16px;
		background: var(--fill);
		cursor: pointer;
		transition: background-color var(--dur-control) var(--ease-ios);
	}
	input::before {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 27px;
		height: 27px;
		border-radius: 50%;
		background: var(--thumb);
		box-shadow: var(--shadow-1);
		transition: transform var(--dur-control) var(--ease-ios), width var(--dur-control) var(--ease-ios);
	}
	input:checked {
		background: var(--tint-solid);
		/* Night fills nothing brightly: a ring says it is on. */
		box-shadow: inset 0 0 0 var(--state-ring) var(--on-tint-solid);
	}
	input:checked::before {
		background: var(--on-tint-solid);
		transform: translateX(20px);
	}
	/* Pressed, the knob stretches toward where it will go. */
	input:active:not(:disabled)::before {
		width: 33px;
	}
	input:checked:active:not(:disabled)::before {
		transform: translateX(14px);
	}
	input:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.disabled {
		opacity: 0.4;
	}
	@media (prefers-reduced-motion: reduce) {
		input,
		input::before {
			transition-duration: 0ms;
		}
	}
</style>
