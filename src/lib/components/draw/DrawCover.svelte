<script lang="ts">
	// The drawing's own screen: it covers the app, the canvas in the middle, the tools on the edge
	// of the holding hand (along the foot in a phone-width window), Done in the top corner on that
	// side. A modal layer: Escape and Done close it, Tab stays inside. Not a Sheet: a canvas needs
	// the whole screen and no drag to dismiss. It comes up and leaves with a rise; nothing waits on
	// it, and reduced motion stills it (kit motion.ts).
	import type { Snippet } from 'svelte';
	import { getScreen, holdFocus, layer, portal, trapTab } from '$lib/components/ios/layer.svelte';
	import { rise } from '$lib/components/ios/motion';
	import { t } from '$lib/i18n/messages';

	let {
		title,
		hand,
		hint,
		onclose,
		children,
		tools
	}: {
		title: string;
		hand: 'left' | 'right';
		/** One line on what the tool does. */
		hint?: string;
		onclose: () => void;
		children: Snippet;
		tools: Snippet;
	} = $props();

	const screen = getScreen();

	function hold(node: HTMLElement) {
		return holdFocus(node);
	}
</script>

<div
	class="cover"
	data-hand={hand}
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	{@attach portal(() => screen?.el)}
	{@attach hold}
	use:layer={onclose}
	onkeydown={(e) => e.key === 'Tab' && trapTab(e, e.currentTarget)}
	in:rise|global={{ y: 24 }}
	out:rise|global={{ y: 16, exit: true }}
>
	<header class="bar material-bar">
		<h2>{title}</h2>
		<button type="button" class="done" onclick={onclose}>{t('draw.done')}</button>
	</header>
	<div class="body">
		<div class="stage">
			{@render children()}
			{#if hint}<p class="hint">{hint}</p>{/if}
		</div>
		<div class="tools material-bar" role="toolbar" aria-label={t('draw.tools')}>
			{@render tools()}
		</div>
	</div>
</div>

<style>
	.cover {
		position: fixed;
		inset: 0;
		/* Over the page, its notices and the safety line; under a sheet opened from it. */
		z-index: 38;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--label);
		outline: none;
	}
	.bar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		min-height: 52px;
		padding: var(--safe-top, 0px) 8px 0;
		border-bottom: 0.5px solid var(--separator);
	}
	.cover[data-hand='left'] .bar {
		justify-content: flex-start;
	}
	h2 {
		position: absolute;
		inset: auto 96px;
		text-align: center;
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.done {
		position: relative;
		min-width: 64px;
		min-height: var(--touch, 44px);
		padding: 0 12px;
		font-size: 17px;
		font-weight: 600;
		color: var(--tint);
	}
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.cover[data-hand='left'] .body {
		flex-direction: row-reverse;
	}
	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
		padding: 12px;
	}
	.hint {
		position: absolute;
		left: 50%;
		bottom: 16px;
		max-width: min(520px, calc(100% - 32px));
		transform: translateX(-50%);
		padding: 6px 12px;
		border-radius: 14px;
		background: var(--mat-bar);
		color: var(--label-2);
		font-size: 13px;
		line-height: 18px;
		text-align: center;
		pointer-events: none;
	}
	.tools {
		flex: none;
		width: 84px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 12px 0 calc(12px + var(--safe-bottom, 0px));
		overflow-y: auto;
		border-left: 0.5px solid var(--separator);
	}
	.cover[data-hand='left'] .tools {
		border-left: 0;
		border-right: 0.5px solid var(--separator);
	}
	/* A phone-width window: the tools along the foot, under the thumb either way. */
	@media (max-width: 699px) {
		.body,
		.cover[data-hand='left'] .body {
			flex-direction: column;
		}
		.tools,
		.cover[data-hand='left'] .tools {
			width: auto;
			flex-direction: row;
			flex-wrap: wrap;
			justify-content: center;
			gap: 4px;
			padding: 6px 8px calc(6px + var(--safe-bottom, 0px));
			border: 0;
			border-top: 0.5px solid var(--separator);
		}
		.stage {
			padding: 8px;
		}
	}
</style>
