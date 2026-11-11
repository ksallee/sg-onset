<script lang="ts">
	// A button on the action rail: an icon in a square target with a caption under it. `capture`:
	// the full capture target (`--target`, 15 mm; 20 mm for gloves); else 56 px. `badge`: a count
	// on the corner.
	//
	// It fires on the release, through the browser's click (ios/press.ts): sliding off is the way
	// out, and a file input (the camera) opens only from a real click. A bounce is one press: it
	// takes no second one for 300 ms. The press shows on the way down; the look is dropped when
	// the page goes away, so it is never left pressed on the way back from the camera.
	//
	// Off (`disabled`) it has no filled face, only a dashed outline: the shape says it, not the
	// colour alone. Motion only follows the press; `data-motion="reduced"` stills it.
	import type { Snippet } from 'svelte';
	import { BUTTON_LOCKOUT_MS, idlePress, press, type PressEvent } from '$lib/ios/press';

	let {
		label,
		caption = label,
		capture = false,
		badge,
		disabled = false,
		pressed,
		lockout = BUTTON_LOCKOUT_MS,
		onclick,
		children
	}: {
		/** What it is called (the accessible name). */
		label: string;
		/** The word under the icon: the label unless given. */
		caption?: string;
		capture?: boolean;
		badge?: number;
		disabled?: boolean;
		/** A toggle: whether it is on. */
		pressed?: boolean;
		lockout?: number;
		onclick: () => void;
		children: Snippet;
	} = $props();

	let gate = $state.raw(idlePress);
	const held = $derived(gate.down.length > 0);
	/** Flips on each press taken: restarts the flash that says so. */
	let flash = $state<'a' | 'b' | undefined>(undefined);

	function take(event: PressEvent) {
		const result = press(gate, event, { on: 'release', lockout });
		gate = result.state;
		if (!result.fire || disabled) return;
		flash = flash === 'a' ? 'b' : 'a';
		onclick();
	}
	const reset = () => take({ type: 'reset' });
</script>

<svelte:window onblur={reset} onpagehide={reset} />
<svelte:document onvisibilitychange={reset} />

<button
	type="button"
	class="ios-rail-btn"
	class:capture
	data-held={held || undefined}
	data-flash={flash}
	aria-label={label}
	aria-pressed={pressed}
	{disabled}
	onpointerdown={(e) => take({ type: 'down', id: e.pointerId, at: e.timeStamp, button: e.button, pointerType: e.pointerType })}
	onpointerup={(e) => take({ type: 'up', id: e.pointerId, at: e.timeStamp })}
	onpointercancel={(e) => take({ type: 'cancel', id: e.pointerId, at: e.timeStamp })}
	onpointerleave={(e) => take({ type: 'leave', id: e.pointerId })}
	onclick={(e) => take({ type: 'click', at: e.timeStamp })}
	onkeydown={(e) => {
		if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
	}}
	oncontextmenu={(e) => e.preventDefault()}
>
	<span class="face">
		<span class="took" aria-hidden="true"></span>
		{@render children()}
		{#if badge}<span class="badge num">{badge}</span>{/if}
	</span>
	<span class="caption">{caption}</span>
</button>

<style>
	.ios-rail-btn {
		--side: 56px;
		--t-press: 90ms;
		--t-release: 260ms;
		--s-press: 0.93;
		--took: 420ms;
		--ease-out: cubic-bezier(0.23, 1, 0.32, 1);

		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		flex: none;
		width: var(--rail-btn-w, max(var(--side), 64px));
		color: var(--label);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(:root:not([data-motion='full'])) .ios-rail-btn {
			--t-press: 0ms;
			--t-release: 0ms;
			--s-press: 1;
			--took: 0ms;
		}
	}
	:global(:root[data-motion='reduced']) .ios-rail-btn {
		--t-press: 0ms;
		--t-release: 0ms;
		--s-press: 1;
		--took: 0ms;
	}
	.ios-rail-btn.capture {
		--side: var(--target);
		width: var(--target);
	}
	.face {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--side);
		height: var(--side);
		border-radius: 16px;
		background: var(--fill-2);
		/* An edge of its own: the fill alone is 1.2 to 1.6 to 1 on the rail. */
		box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--label) 34%, transparent);
		transition: transform var(--t-release) var(--ease-out);
	}
	.capture .face {
		border-radius: 22px;
		background: var(--fill);
	}
	/* The press, on the first frame: the face inverts. The scale follows. */
	.ios-rail-btn[data-held]:not(:disabled) .face,
	.ios-rail-btn[aria-pressed='true'] .face {
		background: var(--label);
		color: var(--bg);
		box-shadow: none;
	}
	.ios-rail-btn[data-held]:not(:disabled) .face {
		transform: scale(var(--s-press));
		transition-duration: var(--t-press);
	}
	/* Taken: a wash that fades. It says the press landed after the finger has gone. */
	.took {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--label);
		opacity: 0;
		pointer-events: none;
	}
	[data-flash='a'] .took {
		animation: ios-rail-took-a var(--took) var(--ease-out);
	}
	[data-flash='b'] .took {
		animation: ios-rail-took-b var(--took) var(--ease-out);
	}
	@keyframes ios-rail-took-a {
		from {
			opacity: 0.45;
		}
	}
	@keyframes ios-rail-took-b {
		from {
			opacity: 0.45;
		}
	}

	/* Off: no face, a dashed outline, the icon and the word dimmed. */
	.ios-rail-btn:disabled {
		color: color-mix(in srgb, var(--label) 50%, transparent);
	}
	.ios-rail-btn:disabled .face {
		background: none;
		box-shadow: none;
		outline: 1.5px dashed color-mix(in srgb, var(--label) 50%, transparent);
		outline-offset: -1.5px;
	}
	.ios-rail-btn:disabled .took {
		display: none;
	}
	.ios-rail-btn:focus-visible {
		outline: none;
	}
	.ios-rail-btn:focus-visible .face {
		outline: 3px solid var(--tint);
		outline-offset: 3px;
	}
	.caption {
		font-size: 13px;
		line-height: 16px;
		font-weight: 600;
		white-space: nowrap;
	}
	.capture .caption {
		font-size: 14px;
		font-weight: 700;
	}
	.badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 26px;
		height: 26px;
		padding: 0 7px;
		border-radius: 13px;
		background: var(--label);
		color: var(--bg);
		box-shadow: 0 0 0 3px var(--bg-elevated);
		font-size: 14px;
		line-height: 26px;
		font-weight: 700;
		text-align: center;
	}
</style>
