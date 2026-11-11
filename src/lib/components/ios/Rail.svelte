<script lang="ts">
	// The action rail: the capture buttons on the screen edge under the holding thumb. On a side
	// edge they sit from mid-height to two thirds up (their middle at 43 % from the top), with
	// `more` right under them, in the same thumb's sweep, and `top` out of the way in the corner.
	// Along the foot (compact) capture is on the hand's side. Sizes come from the Workspace's
	// `--target` and `--gap`. Nothing here animates: it is the capture path.
	import type { Snippet } from 'svelte';
	import type { WorkspaceLayout } from '$lib/ios/handedness';

	let {
		edge,
		label,
		rolling = false,
		top,
		capture,
		more
	}: { edge: WorkspaceLayout['rail']; label: string; rolling?: boolean; top?: Snippet; capture: Snippet; more?: Snippet } = $props();
</script>

<div class="ios-rail" data-edge={edge} class:rolling role="toolbar" aria-label={label} aria-orientation={edge.startsWith('bottom') ? 'horizontal' : 'vertical'}>
	{#if top}<div class="top">{@render top()}</div>{/if}
	<div class="band">
		<div class="capture">{@render capture()}</div>
		{#if more}<div class="more">{@render more()}</div>{/if}
	</div>
</div>

<style>
	.ios-rail {
		--pad: 12px;
		position: relative;
		height: 100%;
		width: calc(var(--target) + 2 * var(--pad));
		box-sizing: content-box;
		background: var(--bg-elevated);
	}
	.ios-rail[data-edge='right'] {
		padding-right: env(safe-area-inset-right);
		border-left: var(--hairline) solid var(--separator);
	}
	.ios-rail[data-edge='left'] {
		padding-left: env(safe-area-inset-left);
		border-right: var(--hairline) solid var(--separator);
	}
	/* Rolling shows on the rail's inner edge too: a solid bar. Words and shape say it elsewhere. */
	.ios-rail.rolling[data-edge='right'] {
		box-shadow: inset 4px 0 0 var(--record);
	}
	.ios-rail.rolling[data-edge='left'] {
		box-shadow: inset -4px 0 0 var(--record);
	}
	.top {
		position: absolute;
		top: 12px;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
	}
	.band {
		position: absolute;
		left: 0;
		right: 0;
		/* The middle of the two capture targets (each with a 34 px caption) at 43 % of the height:
		   Record at a third down, Photo at half. */
		top: max(88px, calc(43% - (2 * var(--target) + var(--gap) + 68px) / 2));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--gap) + 8px);
	}
	.capture,
	.more {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--gap);
	}

	/* Along the foot. */
	.ios-rail[data-edge^='bottom'] {
		display: flex;
		align-items: flex-start;
		gap: var(--gap);
		width: auto;
		height: auto;
		padding: 10px calc(16px + env(safe-area-inset-right)) calc(6px + var(--safe-bottom)) calc(16px + env(safe-area-inset-left));
		border-top: var(--hairline) solid var(--separator);
	}
	.ios-rail[data-edge='bottom-left'] {
		flex-direction: row-reverse;
	}
	.ios-rail.rolling[data-edge^='bottom'] {
		box-shadow: inset 0 4px 0 var(--record);
	}
	[data-edge^='bottom'] .top {
		position: static;
		align-self: center;
	}
	[data-edge^='bottom'] .band {
		position: static;
		flex: 1;
		flex-direction: row;
		justify-content: space-between;
		align-items: flex-start;
	}
	[data-edge^='bottom'] .capture,
	[data-edge^='bottom'] .more {
		flex-direction: row;
		align-items: flex-start;
	}
	/* Right hand: Record at the right end, Photo next to it, the rest toward the middle. */
	[data-edge='bottom-right'] .band,
	[data-edge='bottom-right'] .capture {
		flex-direction: row-reverse;
	}
	[data-edge='bottom-left'] .more {
		flex-direction: row-reverse;
	}
</style>
