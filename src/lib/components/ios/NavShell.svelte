<script lang="ts">
	// The frame of the app on an iPad: the navigation and, beside or under it, the page. Wide (an
	// iPad in landscape): a sidebar on the side edge away from the holding hand, with names or as
	// a strip of icons (`strip`). `focus`: a page on the capture path, where the width never eases. In
	// portrait and in a phone-width window: a bar across the top, its tabs starting from the far
	// corner. Never along the foot and never on the holding hand's edge: that is where a
	// Workspace puts its action rail (ios/shell.ts). The left hand mirrors it all. The width eases
	// only after the collapse button, never on a change of page.
	// The page gets what is left as `--app-height`, so a Workspace, a Page or a Screen fills it.
	// Sheets opened anywhere inside land on the shell and cover the navigation.
	import type { Component, Snippet } from 'svelte';
	import { PanelLeft, PanelRight } from '@lucide/svelte';
	import type { Hand } from '$lib/ios/handedness';
	import { shellLayout, SIDEBAR_W, STRIP_W } from '$lib/ios/shell';
	import { setScreen } from './layer.svelte';

	type Item = { id: string; href: string; label: string; icon: Component<{ class?: string; strokeWidth?: number }> };

	let {
		items,
		active,
		hand = 'right',
		strip = false,
		focus = false,
		label,
		title,
		ontoggle,
		toggleLabel,
		status,
		children,
		class: cls = ''
	}: {
		items: Item[];
		/** The id of the item the page belongs to. */
		active?: string;
		hand?: Hand;
		strip?: boolean;
		focus?: boolean;
		/** What the navigation is called, for assistive tech. */
		label: string;
		/** The name at the head of the sidebar. */
		title?: string;
		/** The sidebar's collapse button: shown when given. */
		ontoggle?: () => void;
		toggleLabel?: string;
		/** A quiet status at the end of the navigation. It is told where it sits. */
		status?: Snippet<['side' | 'strip' | 'top']>;
		children: Snippet;
		class?: string;
	} = $props();

	let el = $state<HTMLElement | null>(null);
	let width = $state(typeof window === 'undefined' ? 1180 : window.innerWidth);
	const layout = $derived(shellLayout(hand, width, { strip }));
	/** The button was pressed off the capture path: the width eases for a moment. */
	let resizing = $state(false);
	let settle: ReturnType<typeof setTimeout> | undefined;
	function toggle() {
		if (!focus) {
			resizing = true;
			clearTimeout(settle);
			settle = setTimeout(() => (resizing = false), 400);
		}
		ontoggle?.();
	}
	$effect(() => () => clearTimeout(settle));
	const Toggle = $derived(layout.edge === 'left' ? PanelLeft : PanelRight);

	setScreen({
		scrollY: 0,
		get el() {
			return el;
		}
	});
</script>

<div
	class="ios-shell {cls}"
	data-ios-screen
	data-nav={layout.nav}
	data-edge={layout.edge}
	data-strip={layout.strip ? '' : undefined}
	data-focus={focus ? '' : undefined}
	data-resizing={resizing ? '' : undefined}
	style:--sidebar-w="{SIDEBAR_W}px"
	style:--strip-w="{STRIP_W}px"
	bind:this={el}
	bind:clientWidth={width}
>
	<nav class="nav" aria-label={label}>
		{#if layout.nav === 'side'}
			<div class="head">
				{#if ontoggle}
					<button type="button" class="toggle" aria-label={toggleLabel} aria-expanded={!layout.strip} onclick={toggle}>
						<Toggle class="size-[22px]" strokeWidth={1.9} />
					</button>
				{/if}
				{#if title && !layout.strip}<span class="title">{title}</span>{/if}
			</div>
		{/if}
		<ul class="items">
			{#each items as item (item.id)}
				{@const on = item.id === active}
				<li>
					<a href={item.href} class="item" class:on aria-current={on ? 'page' : undefined}>
						<item.icon class="icon" strokeWidth={on ? 2.2 : 1.8} />
						<span class="word">{item.label}</span>
					</a>
				</li>
			{/each}
		</ul>
		{#if status}
			<div class="status">{@render status(layout.nav === 'top' ? 'top' : layout.strip ? 'strip' : 'side')}</div>
		{/if}
	</nav>
	<div class="content">{@render children()}</div>
</div>

<style>
	.ios-shell {
		--sheet-half: 280px;
		position: relative;
		display: grid;
		height: 100dvh;
		background: var(--bg);
		color: var(--label);
		overflow: hidden;
	}
	.content {
		--app-height: 100%;
		position: relative;
		grid-area: content;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.nav {
		grid-area: nav;
		position: relative;
		z-index: 3;
		display: flex;
		min-width: 0;
		min-height: 0;
		background: var(--bg-elevated);
		/* It stays put while a page pushes or pops (app.css slides the rest). */
		view-transition-name: shell-nav;
	}
	.items {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.item {
		display: flex;
		align-items: center;
		color: var(--label);
		border-radius: 12px;
		transition: background-color var(--dur-press);
		-webkit-user-select: none;
		user-select: none;
	}
	.item :global(.icon) {
		flex: none;
		width: 24px;
		height: 24px;
	}
	.item.on {
		background: var(--fill-2);
		color: var(--tint);
		font-weight: 600;
	}
	.item:active {
		background: var(--fill);
		transition: none;
	}
	.item:focus-visible,
	.toggle:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: -2px;
	}
	.word {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ------------------------------------------------------------ the sidebar */
	[data-nav='side'] {
		grid-template-rows: minmax(0, 1fr);
	}
	[data-nav='side'][data-edge='left'] {
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas: 'nav content';
	}
	[data-nav='side'][data-edge='right'] {
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'content nav';
	}
	[data-nav='side'] .nav {
		flex-direction: column;
		width: var(--sidebar-w);
		padding: var(--safe-top) 12px calc(12px + var(--safe-bottom));
	}
	[data-nav='side'][data-resizing] .nav {
		transition: width 260ms var(--ease-ios);
	}
	[data-nav='side'][data-edge='left'] .nav {
		padding-left: calc(12px + env(safe-area-inset-left));
		border-right: var(--hairline) solid var(--separator);
	}
	[data-nav='side'][data-edge='right'] .nav {
		padding-right: calc(12px + env(safe-area-inset-right));
		border-left: var(--hairline) solid var(--separator);
	}
	[data-nav='side'][data-strip] .nav {
		width: var(--strip-w);
		padding-left: 8px;
		padding-right: 8px;
	}
	/* No motion beside the capture path. */
	[data-focus] .nav {
		transition: none;
	}
	.head {
		flex: none;
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 52px;
		margin-bottom: 8px;
	}
	[data-edge='right'] .head {
		flex-direction: row-reverse;
	}
	[data-strip] .head {
		justify-content: center;
	}
	.toggle {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		width: max(44px, var(--touch, 44px));
		height: max(44px, var(--touch, 44px));
		border-radius: 12px;
		color: var(--tint);
	}
	.toggle:active {
		background: var(--fill-3);
	}
	.title {
		flex: 1;
		min-width: 0;
		padding: 0 6px;
		font-size: 22px;
		line-height: 28px;
		font-weight: 700;
		letter-spacing: -0.26px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	[data-edge='right'] .title {
		text-align: right;
	}
	[data-nav='side'] .items {
		flex: 1;
		min-height: 0;
		flex-direction: column;
		gap: 4px;
	}
	[data-nav='side'] .item {
		gap: 14px;
		min-height: max(48px, var(--touch, 44px));
		padding: 0 12px;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
	}
	/* The strip: an icon over its name, in the middle of the edge, where the other thumb rests. */
	[data-nav='side'][data-strip] .items {
		justify-content: center;
		gap: 8px;
		padding-bottom: 8%;
	}
	[data-nav='side'][data-strip] .item {
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		min-height: max(60px, var(--touch, 44px));
		padding: 6px 0;
		font-size: 11px;
		line-height: 13px;
		letter-spacing: 0.06px;
		font-weight: 500;
	}
	[data-nav='side'][data-strip] .item.on {
		font-weight: 600;
	}
	[data-nav='side'] .status {
		flex: none;
	}

	/* ------------------------------------------------------------ the top bar */
	[data-nav='top'] {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
		grid-template-areas: 'nav' 'content';
	}
	[data-nav='top'] .nav {
		container-type: inline-size;
		align-items: center;
		gap: 8px;
		padding: calc(6px + var(--safe-top)) calc(10px + env(safe-area-inset-right)) 6px calc(10px + env(safe-area-inset-left));
		border-bottom: var(--hairline) solid var(--separator);
	}
	/* The tabs start from the corner away from the holding hand; the status is at the other end. */
	[data-nav='top'][data-edge='right'] .nav {
		flex-direction: row-reverse;
	}
	[data-nav='top'] .content {
		--safe-top: 0px;
	}
	[data-nav='top'] .items {
		flex: 1;
		min-width: 0;
		gap: 4px;
	}
	[data-nav='top'][data-edge='right'] .items {
		flex-direction: row-reverse;
	}
	[data-nav='top'] .item {
		gap: 8px;
		min-height: max(44px, var(--touch, 44px));
		padding: 0 14px;
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		font-weight: 500;
	}
	[data-nav='top'] .item :global(.icon) {
		width: 22px;
		height: 22px;
	}
	[data-nav='top'] .status {
		flex: none;
	}
	/* A phone-width window: an icon over its name, the tabs sharing the width. */
	@container (max-width: 699px) {
		[data-nav='top'] .items {
			gap: 0;
		}
		[data-nav='top'] .items li {
			flex: 1 1 0;
			min-width: 0;
		}
		[data-nav='top'] .item {
			flex-direction: column;
			justify-content: center;
			gap: 2px;
			min-height: max(48px, var(--touch, 44px));
			padding: 4px 2px;
			font-size: 10px;
			line-height: 12px;
			letter-spacing: 0.1px;
		}
	}
</style>
