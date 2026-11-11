<script lang="ts">
	// The frame of the app on an iPad: the navigation and, beside or under it, the page. Wide (an
	// iPad in landscape): a sidebar on the side edge away from the holding hand, with names or as
	// a strip of icons (`strip`). `focus`: a page on the capture path, where nothing eases. In
	// portrait and in a phone-width window: a bar across the top, its tabs starting from the far
	// corner. Never along the foot and never on the holding hand's edge: that is where a
	// Workspace puts its action rail (ios/shell.ts). The left hand mirrors it all.
	// The page gets what is left as `--app-height`, so a Workspace, a Page or a Screen fills it.
	// Sheets opened anywhere inside land on the shell and cover the navigation.
	//
	// Motion (docs/design/motion.md). The collapse button: the layout changes once, at once; then
	// the sidebar's edge slides, the icons glide to their new places, the names fade, and the
	// page glides to where it now sits. Transforms and opacity only, so no frame asks for layout.
	// A change of page never eases the width. The mark of the current item slides to the new one.
	// The page sits on a stage (`data-page-stage`) that pageStage.ts pushes, pops and fades;
	// `overlay` is drawn over it and stays put.
	import { flushSync, untrack, type Component, type Snippet } from 'svelte';
	import { PanelLeft, PanelRight } from '@lucide/svelte';
	import type { Hand } from '$lib/ios/handedness';
	import { shellLayout, SIDEBAR_W, STRIP_W } from '$lib/ios/shell';
	import { DURATIONS, EASINGS, springCss } from '$lib/theme/motion';
	import { reducedMotion, setScreen } from './layer.svelte';
	import { animateSpring, boxOf, flipFrom, settle } from './motion';

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
		overlay,
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
		/** Drawn over the page and outside its stage: it stays put while pages change (a notice). */
		overlay?: Snippet;
		children: Snippet;
		class?: string;
	} = $props();

	let el = $state<HTMLElement | null>(null);
	let list = $state<HTMLElement | null>(null);
	let mark = $state<HTMLElement | null>(null);
	let content = $state<HTMLElement | null>(null);
	let head = $state<HTMLElement | null>(null);
	let foot = $state<HTMLElement | null>(null);
	let width = $state(typeof window === 'undefined' ? 1180 : window.innerWidth);
	const layout = $derived(shellLayout(hand, width, { strip }));
	const Toggle = $derived(layout.edge === 'left' ? PanelLeft : PanelRight);

	// ---- the collapse button
	/** The button was pressed: the sidebar's own transitions run for this long. */
	let moving = $state(false);
	let rest: ReturnType<typeof setTimeout> | undefined;
	/** What the eye is on in the page: the first block of a Page's column, else the whole content. */
	const column = () => content?.querySelector<HTMLElement>('.ios-page-scroll > :not(.ios-navbar)') ?? content;

	function toggle() {
		if (focus || layout.nav !== 'side' || !list || !content || reducedMotion()) return void ontoggle?.();
		// First: where everything is drawn now, mid-flight or not.
		const icons = [...list.querySelectorAll<HTMLElement>('.item')].map((item) => ({ item, box: boxOf(item.querySelector('.icon') ?? item) }));
		const button = head?.querySelector<HTMLElement>('.toggle');
		const buttonBox = button && boxOf(button);
		const markBox = mark && mark.style.opacity !== '0' ? boxOf(mark) : null;
		const eye = column();
		const eyeBox = eye && boxOf(eye);

		moving = true;
		clearTimeout(rest);
		rest = setTimeout(() => (moving = false), springCss('smooth').duration + 120);
		// Last: the new layout, once.
		ontoggle?.();
		flushSync();

		// Invert and play: each thing starts where it was drawn and goes to its place.
		for (const { item } of icons) settle(item);
		settle(content);
		const moves = icons.map(({ item, box }) => ({ item, box, now: boxOf(item.querySelector('.icon') ?? item) }));
		const eyeNow = eye && eye.isConnected ? boxOf(eye) : null;
		for (const { item, box, now } of moves) {
			const dx = box.x - now.x;
			const dy = box.y - now.y;
			if (Math.abs(dx) + Math.abs(dy) >= 0.5) animateSpring(item, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], 'smooth');
		}
		if (button && buttonBox) flipFrom(button, buttonBox);
		if (mark && markBox) flipFrom(mark, markBox, { scale: true });
		if (eyeBox && eyeNow && Math.abs(eyeBox.x - eyeNow.x) >= 0.5) {
			animateSpring(content, [{ transform: `translateX(${eyeBox.x - eyeNow.x}px)` }, { transform: 'none' }], 'smooth');
		}
		foot?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: DURATIONS.fade * 2, easing: EASINGS.out });
	}
	$effect(() => () => clearTimeout(rest));

	// ---- the mark of the current item: one element that slides from item to item
	/** Puts the mark on the current item; `slide`: from where it is drawn now. */
	function place(slide: boolean) {
		if (!mark || !list) return;
		const item = list.querySelector<HTMLElement>('.item[aria-current="page"]');
		if (!item) return void (mark.style.opacity = '0');
		const from = slide && mark.style.opacity !== '0' && !reducedMotion() ? boxOf(mark) : null;
		Object.assign(mark.style, { opacity: '1', left: `${item.offsetLeft}px`, top: `${item.offsetTop}px`, width: `${item.offsetWidth}px`, height: `${item.offsetHeight}px` });
		if (from) flipFrom(mark, from, { spring: 'snappy', scale: true });
		else if (!moving) settle(mark);
	}
	let seen: { id?: string; shape: string; focus: boolean } | null = null;
	$effect(() => {
		const now = { id: active, shape: `${layout.nav} ${layout.edge} ${layout.strip}`, focus };
		void [mark, list];
		untrack(() => {
			// It slides when the page changed and nothing else did; never to or from the capture path.
			place(!!seen && seen.id !== now.id && seen.shape === now.shape && !seen.focus && !now.focus);
			seen = now;
		});
	});
	// The items changed size (the window, the button size): the mark follows at once.
	$effect(() => {
		if (!list || typeof ResizeObserver === 'undefined') return;
		let first = true;
		let frame = 0;
		// Placed on the next frame, not in the callback: moving the mark there would be a change
		// of size inside the observer's own report.
		const sizes = new ResizeObserver(() => {
			if (first) return void (first = false);
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => place(false));
		});
		sizes.observe(list);
		for (const li of list.children) if (li !== mark) sizes.observe(li);
		return () => {
			cancelAnimationFrame(frame);
			sizes.disconnect();
		};
	});

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
	data-moving={moving ? '' : undefined}
	style:--sidebar-w="{SIDEBAR_W}px"
	style:--strip-w="{STRIP_W}px"
	bind:this={el}
	bind:clientWidth={width}
>
	<nav class="nav" aria-label={label}>
		<div class="panel">
			<div class="pane">
				{#if layout.nav === 'side'}
					<div class="head" bind:this={head}>
						{#if ontoggle}
							<button type="button" class="toggle" aria-label={toggleLabel} aria-expanded={!layout.strip} onclick={toggle}>
								<Toggle class="size-[22px]" strokeWidth={1.9} />
							</button>
						{/if}
						{#if title}<span class="title" aria-hidden={layout.strip}>{title}</span>{/if}
					</div>
				{/if}
				<ul class="items" bind:this={list}>
					<li class="mark" aria-hidden="true" bind:this={mark}></li>
					{#each items as item (item.id)}
						{@const on = item.id === active}
						<li>
							<a href={item.href} class="item" class:on aria-label={item.label} aria-current={on ? 'page' : undefined}>
								<item.icon class="icon" strokeWidth={on ? 2.2 : 1.8} />
								<span class="word full" aria-hidden="true">{item.label}</span>
								<span class="word mini" aria-hidden="true">{item.label}</span>
							</a>
						</li>
					{/each}
				</ul>
				{#if status}
					<div class="status" bind:this={foot}>{@render status(layout.nav === 'top' ? 'top' : layout.strip ? 'strip' : 'side')}</div>
				{/if}
			</div>
		</div>
	</nav>
	<div class="content" bind:this={content}>
		<div class="stage" data-page-stage>{@render children()}</div>
		{@render overlay?.()}
	</div>
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
	/* The page. pageStage.ts moves it, and a picture of the one before it, on a change of page. */
	.stage {
		position: relative;
		z-index: 1;
		height: 100%;
		background: var(--bg);
	}
	.nav {
		grid-area: nav;
		position: relative;
		z-index: 3;
		min-width: 0;
		min-height: 0;
	}
	.pane {
		display: flex;
		min-width: 0;
		min-height: 0;
	}
	.items {
		position: relative;
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* The current item's ground: one element, placed on the item (place() in the script), that
	   slides to the next. No item draws its own. */
	.mark {
		position: absolute;
		z-index: 0;
		left: 0;
		top: 0;
		opacity: 0;
		border-radius: 12px;
		background: var(--selection);
		pointer-events: none;
	}
	.item {
		position: relative;
		z-index: 1;
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
		color: var(--tint);
	}
	.item:active {
		background: var(--fill);
		transition: none;
	}
	.item:focus-visible,
	.toggle:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	/* Each item has its name twice: beside the icon (`full`) and under it (`mini`). One shows;
	   the other waits where it would sit, see-through, so the two cross-fade when the sidebar
	   folds and no text is laid out again mid-move. */
	.word {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.full {
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
	}
	.mini {
		font-size: 11px;
		line-height: 13px;
		letter-spacing: 0.06px;
		font-weight: 500;
	}
	.on .full,
	.on .mini {
		font-weight: 600;
	}

	/* ------------------------------------------------------------ the sidebar
	   The column is `--nav-w` wide: it changes at once. The panel is always the open width and
	   slides under its own clip; the pane inside slides the other way by as much, so what it
	   holds stays still on the screen while the edge passes over it. */
	[data-nav='side'] {
		--nav-w: var(--sidebar-w);
		--travel: calc(var(--sidebar-w) - var(--strip-w));
		grid-template-rows: minmax(0, 1fr);
	}
	[data-nav='side'][data-strip] {
		--nav-w: var(--strip-w);
	}
	[data-nav='side'][data-edge='left'] {
		grid-template-columns: var(--nav-w) minmax(0, 1fr);
		grid-template-areas: 'nav content';
	}
	[data-nav='side'][data-edge='right'] {
		grid-template-columns: minmax(0, 1fr) var(--nav-w);
		grid-template-areas: 'content nav';
	}
	[data-nav='side'] .panel {
		position: absolute;
		top: 0;
		bottom: 0;
		width: var(--sidebar-w);
		overflow: hidden;
		background: var(--sidebar);
	}
	[data-nav='side'][data-edge='left'] .panel {
		left: 0;
		border-right: var(--hairline) solid var(--separator);
	}
	[data-nav='side'][data-edge='right'] .panel {
		right: 0;
		border-left: var(--hairline) solid var(--separator);
	}
	[data-nav='side'] .pane {
		flex-direction: column;
		height: 100%;
		padding: var(--safe-top) 12px calc(12px + var(--safe-bottom));
	}
	[data-nav='side'][data-edge='left'] .pane {
		padding-left: calc(12px + env(safe-area-inset-left));
	}
	[data-nav='side'][data-edge='right'] .pane {
		padding-right: calc(12px + env(safe-area-inset-right));
	}
	/* The strip: the panel slides out to its edge, the pane back in, and the pane keeps its
	   items to the part still in sight. */
	[data-nav='side'][data-strip][data-edge='left'] .panel {
		transform: translateX(calc(-1 * var(--travel)));
	}
	[data-nav='side'][data-strip][data-edge='left'] .pane {
		transform: translateX(var(--travel));
		padding-left: 8px;
		padding-right: calc(8px + var(--travel));
	}
	[data-nav='side'][data-strip][data-edge='right'] .panel {
		transform: translateX(var(--travel));
	}
	[data-nav='side'][data-strip][data-edge='right'] .pane {
		transform: translateX(calc(-1 * var(--travel)));
		padding-right: 8px;
		padding-left: calc(8px + var(--travel));
	}
	/* Only after the collapse button; never on a change of page, never beside the capture path. */
	[data-moving] .panel,
	[data-moving] .pane {
		transition: transform var(--dur-smooth) var(--spring-smooth);
	}
	/* A name going fades fast; the one coming waits for it, then fades in. */
	[data-moving] .word,
	[data-moving] .title {
		transition: opacity var(--dur-fade) var(--ease-out);
	}
	[data-moving]:not([data-strip]) .full,
	[data-moving]:not([data-strip]) .title,
	[data-moving][data-strip] .mini {
		transition: opacity var(--dur-exit) var(--ease-out) 90ms;
	}
	.head {
		position: relative;
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
	/* In the strip the title waits beside the button, see-through and out of the layout. */
	[data-strip] .title {
		position: absolute;
		top: 50%;
		left: calc(50% + 30px);
		width: 160px;
		transform: translateY(-50%);
		opacity: 0;
		pointer-events: none;
	}
	[data-strip][data-edge='right'] .title {
		left: auto;
		right: calc(50% + 30px);
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
	}
	[data-nav='side']:not([data-strip]) .mini {
		position: absolute;
		top: calc(50% + 15px);
		left: 24px;
		transform: translateX(-50%);
		opacity: 0;
		pointer-events: none;
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
	}
	[data-nav='side'][data-strip] .full {
		position: absolute;
		top: 50%;
		left: calc(50% + 26px);
		transform: translateY(-50%);
		opacity: 0;
		pointer-events: none;
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
		background: var(--sidebar);
		border-bottom: var(--hairline) solid var(--separator);
	}
	[data-nav='top'] .pane {
		align-items: center;
		gap: 8px;
		padding: calc(6px + var(--safe-top)) calc(10px + env(safe-area-inset-right)) 6px calc(10px + env(safe-area-inset-left));
	}
	/* The tabs start from the corner away from the holding hand; the status is at the other end. */
	[data-nav='top'][data-edge='right'] .pane {
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
	}
	[data-nav='top'] .full {
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		font-weight: 500;
	}
	[data-nav='top'] .on .full {
		font-weight: 600;
	}
	[data-nav='top'] .mini {
		display: none;
		font-size: 10px;
		line-height: 12px;
		letter-spacing: 0.1px;
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
		[data-nav='top'] .items li:not(.mark) {
			flex: 1 1 0;
			min-width: 0;
		}
		[data-nav='top'] .item {
			flex-direction: column;
			justify-content: center;
			gap: 2px;
			min-height: max(48px, var(--touch, 44px));
			padding: 4px 2px;
		}
		[data-nav='top'] .full {
			display: none;
		}
		[data-nav='top'] .mini {
			display: block;
			max-width: 100%;
		}
	}
</style>
