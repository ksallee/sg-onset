<script lang="ts">
	// A button on the action rail: an icon in a square target with a caption under it. `capture`:
	// the full capture target (`--target`, 15 mm; 20 mm for gloves); else 56 px. `badge`: a count
	// on the corner. The press shows at once and nothing eases back: it is the capture path.
	import type { Snippet } from 'svelte';

	let {
		label,
		caption = label,
		capture = false,
		badge,
		disabled = false,
		pressed,
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
		onclick: () => void;
		children: Snippet;
	} = $props();
</script>

<button type="button" class="ios-rail-btn" class:capture aria-label={label} aria-pressed={pressed} {disabled} {onclick}>
	<span class="face">
		{@render children()}
		{#if badge}<span class="badge num">{badge}</span>{/if}
	</span>
	<span class="caption">{caption}</span>
</button>

<style>
	.ios-rail-btn {
		--side: 56px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex: none;
		width: max(var(--side), 64px);
		color: var(--label);
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
	}
	.capture .face {
		border-radius: 22px;
		background: var(--fill);
	}
	.ios-rail-btn:active:not(:disabled) .face,
	.ios-rail-btn[aria-pressed='true'] .face {
		background: var(--label);
		color: var(--bg);
	}
	.ios-rail-btn:disabled {
		color: var(--label-3);
	}
	.ios-rail-btn:focus-visible {
		outline: none;
	}
	.ios-rail-btn:focus-visible .face {
		outline: 2px solid var(--tint);
		outline-offset: 2px;
	}
	.caption {
		font-size: 12px;
		line-height: 14px;
		font-weight: 600;
		white-space: nowrap;
	}
	.badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 24px;
		height: 24px;
		padding: 0 7px;
		border-radius: 12px;
		background: var(--label);
		color: var(--bg);
		font-size: 13px;
		line-height: 24px;
		font-weight: 700;
		text-align: center;
	}
</style>
