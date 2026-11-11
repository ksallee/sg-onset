<script lang="ts">
	// What was just done, with one action (Undo). A pill at the foot of the page, in the middle:
	// clear of the side edges, where the thumbs and the action rail are. It fades in; with reduced
	// motion (`data-motion`, app.css) it just shows.
	import type { Snippet } from 'svelte';

	let { text, action, onaction, children }: { text: string; action?: string; onaction?: () => void; children?: Snippet } = $props();
</script>

<div class="ios-notice" role="status">
	<span class="text">{text}</span>
	{@render children?.()}
	{#if action && onaction}<button type="button" onclick={onaction}>{action}</button>{/if}
</div>

<style>
	.ios-notice {
		position: absolute;
		z-index: 35;
		left: 50%;
		bottom: calc(16px + var(--safe-bottom));
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 12px;
		width: max-content;
		max-width: min(520px, calc(100% - 32px));
		min-height: 52px;
		padding: 4px 4px 4px 18px;
		border-radius: 26px;
		background: var(--cell-elevated);
		color: var(--label);
		box-shadow: 0 0 0 var(--hairline) var(--separator), 0 10px 30px rgb(0 0 0 / 0.28);
		font-size: 16px;
		line-height: 21px;
		font-weight: 600;
		letter-spacing: -0.31px;
		transition: opacity 180ms ease-out, transform 220ms var(--ease-ios);
	}
	@starting-style {
		.ios-notice {
			opacity: 0;
			transform: translate(-50%, 12px);
		}
	}
	.text {
		flex: 1;
		min-width: 0;
		padding: 8px 14px 8px 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	button {
		flex: none;
		height: max(44px, var(--touch, 44px));
		padding: 0 18px;
		border-radius: 22px;
		background: var(--label);
		color: var(--bg);
		font-size: 16px;
		font-weight: 700;
	}
	button:active {
		opacity: 0.6;
	}
	button:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: 2px;
	}
</style>
