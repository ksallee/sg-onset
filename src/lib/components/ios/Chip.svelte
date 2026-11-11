<script lang="ts">
	// A chip: a short value to pick with one tap. 44 px tall (`--chip-h`). `on`: it is the current
	// one, marked by a ring, not by colour alone. It picks on release, not on pointer down: chips
	// sit in a row that scrolls sideways, and a drag that starts on one must scroll, not pick. The
	// press shows at once and lets go when the scroll takes the touch.
	import type { Snippet } from 'svelte';
	let { on = false, label, onclick, children }: { on?: boolean; label?: string; onclick: () => void; children: Snippet } = $props();

	let pressed = $state(false);
	const down = (e: PointerEvent) => e.button === 0 && (pressed = true);
	const up = () => (pressed = false);
</script>

<svelte:window onblur={up} />
<svelte:document onvisibilitychange={up} />

<button
	type="button"
	class="ios-chip num"
	class:on
	aria-label={label}
	aria-pressed={on}
	data-pressed={pressed ? '' : undefined}
	onpointerdown={down}
	onpointerup={up}
	onpointercancel={up}
	onpointerleave={up}
	oncontextmenu={(e) => e.preventDefault()}
	{onclick}
>
	<span class="face">{@render children()}</span>
	<span class="ink" aria-hidden="true">{@render children()}</span>
</button>

<style>
	.ios-chip {
		--ink: var(--key-pressed);
		/* What the current one sits on. */
		--on-bg: var(--tint-fill);
		position: relative;
		isolation: isolate;
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		height: var(--chip-h, 44px);
		padding: 0 12px;
		border-radius: 12px;
		background: var(--fill-3);
		color: var(--label);
		font-family: var(--font-rounded);
		font-size: var(--chip-font, 19px);
		font-weight: 600;
		white-space: nowrap;
		cursor: default;
		outline: none;
		/* The row scrolls sideways from a chip; nothing else starts on one. */
		touch-action: pan-x;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
	}
	/* The current one: a ring and a tinted ground, faded in. */
	.ios-chip::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background: var(--on-bg);
		box-shadow: inset 0 0 0 2.5px var(--tint);
		opacity: 0;
		transition: opacity 160ms ease-out;
	}
	.ios-chip.on::before {
		opacity: 1;
	}
	.ios-chip.on {
		color: var(--tint);
	}

	/* Pressed: it inverts like a key (night: a dim slab and a ring). On at once, off with an ease. */
	.ink {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: inherit;
		background: var(--ink);
		color: var(--key-pressed-label);
		box-shadow: inset 0 0 0 var(--state-ring) var(--key-pressed-label);
		opacity: 0;
		transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
	}
	.ios-chip[data-pressed] .ink {
		opacity: 1;
		transition-duration: 0s;
	}

	.ios-chip:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	:global([data-motion='reduced']) .ios-chip::before,
	:global([data-motion='reduced']) .ink {
		transition: none !important;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(:root:not([data-motion='full'])) .ios-chip::before,
		:global(:root:not([data-motion='full'])) .ink {
			transition: none !important;
		}
	}
</style>
