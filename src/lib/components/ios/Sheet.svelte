<script lang="ts">
	// A sheet with detents (medium, large, or a share of the height). Drag the grabber or header to
	// move it; drag the content when it is scrolled to the top or not at its largest detent. On
	// release ios/detent.ts snapDetent picks the detent or dismisses (a third down, or a flick).
	// The scroll wheel or a scroll up at a smaller detent grows it. A modal dialog: focus moves in,
	// Tab stays inside (keys.ts trapStep), Escape closes the innermost drill-in, then the sheet.
	// A sheet opened over another scales the one under it back. Portals into the Screen.
	// `--sheet-below` on the panel: how far its foot sits below the screen (a smaller detent), so
	// something pinned to the foot (SheetPlayer) can stay in sight.
	import { onDestroy, type Snippet } from 'svelte';
	import { detentOffset, snapDetent, type Detent } from '$lib/ios/detent';
	import { getScreen, holdFocus, overlays, portal, reducedMotion, setSheet, trapTab } from './layer.svelte';
	import { t } from '$lib/i18n/messages';

	let {
		open = $bindable(false),
		detents = ['large'],
		detent = $bindable(),
		title,
		leading,
		trailing,
		done,
		dismissible = true,
		onclose,
		children
	}: {
		open?: boolean;
		detents?: Detent[];
		detent?: Detent;
		title?: string;
		leading?: Snippet;
		trailing?: Snippet;
		/** A Done button on the right that closes: true, or its label. */
		done?: boolean | string;
		/** False: no drag-to-dismiss, no scrim tap, no Escape (an acknowledgement). */
		dismissible?: boolean;
		onclose?: () => void;
		children: Snippet;
	} = $props();

	const screen = getScreen();
	let panel = $state<HTMLElement | null>(null);
	let scroller = $state<HTMLElement | null>(null);
	const ctx = setSheet({
		get panel() {
			return panel;
		},
		get backLabel() {
			return title ?? t('common.back');
		},
		pages: []
	});

	const share = (d: Detent) => (d === 'large' ? 1 : d === 'medium' ? 0.5 : d);
	const largest = $derived(detents.reduce((a, b) => (share(b) > share(a) ? b : a), detents[0] ?? 'large'));
	const current = $derived(detent && detents.includes(detent) ? detent : (detents[0] ?? 'large'));
	const atLargest = $derived(share(current) >= share(largest));

	/** The height the large detent would have; the panel is `share(largest)` of it. */
	let fullH = $state(800);
	/** px the panel sits below its largest detent (drag moves it; at rest the detent's). */
	let drag = $state<number | null>(null);
	let phase = $state<'closed' | 'entering' | 'open' | 'leaving'>('closed');
	let id = 0;
	/** Overlays open under this one when it came up: a stacked sheet sits lower, so the one under peeks out. */
	let depth = $state(0);
	const reduced = reducedMotion();

	const restOffset = $derived(detentOffset(current, fullH) - detentOffset(largest, fullH));
	const offset = $derived(drag ?? restOffset);
	const hidden = $derived(phase === 'entering' || phase === 'leaving' || phase === 'closed');
	const under = $derived(id && phase === 'open' ? overlays.above(id) > 0 : false);

	function measure() {
		if (!panel) return;
		fullH = panel.offsetHeight / share(largest);
	}

	let release: (() => void) | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (open && (phase === 'closed' || phase === 'leaving')) present();
		else if (!open && (phase === 'open' || phase === 'entering')) dismissNow();
	});

	function present() {
		clearTimeout(timer);
		if (phase === 'closed') {
			id = overlays.open();
			depth = overlays.ids.length - 1;
		}
		if (!detent || !detents.includes(detent)) detent = detents[0] ?? 'large';
		phase = 'entering';
		requestAnimationFrame(() => {
			measure();
			requestAnimationFrame(() => {
				if (phase !== 'entering') return;
				phase = 'open';
				if (panel && !release) release = holdFocus(panel);
			});
		});
	}
	function dismissNow() {
		phase = 'leaving';
		drag = null;
		clearTimeout(timer);
		timer = setTimeout(
			() => {
				phase = 'closed';
				overlays.close(id);
				id = 0;
				release?.();
				release = null;
				onclose?.();
			},
			reduced ? 150 : 300
		);
	}
	function close() {
		open = false;
	}
	onDestroy(() => {
		clearTimeout(timer);
		if (id) overlays.close(id);
	});

	// ---- drag
	let start: { y: number; off: number; from: 'grab' | 'content' } | null = null;
	let mode: 'undecided' | 'drag' | 'scroll' = 'undecided';
	let samples: { y: number; t: number }[] = [];

	function begin(y: number, t: number, from: 'grab' | 'content') {
		if (phase !== 'open') return;
		measure();
		start = { y, off: offset, from };
		mode = 'undecided';
		samples = [{ y, t }];
	}
	/** True when this move drags the sheet (the caller then stops the page scrolling). */
	function step(y: number, t: number, target: EventTarget | null): boolean {
		if (!start) return false;
		const dy = y - start.y;
		if (mode === 'undecided') {
			if (Math.abs(dy) < 5) return false;
			const scroll = (target as HTMLElement | null)?.closest?.('[data-sheet-scroll]') as HTMLElement | null;
			if (start.from === 'grab') mode = 'drag';
			else if (!atLargest) mode = 'drag';
			else mode = dy > 0 && (!scroll || scroll.scrollTop <= 0) ? 'drag' : 'scroll';
		}
		if (mode !== 'drag') return false;
		samples = [...samples.filter((s) => t - s.t < 80), { y, t }];
		let next = start.off + dy;
		// Above the largest detent it resists.
		if (next < 0) next = -Math.sqrt(-next) * 2;
		drag = next;
		return true;
	}
	function end(y: number, t: number) {
		if (!start) return;
		const was = mode;
		start = null;
		mode = 'undecided';
		if (was !== 'drag' || drag === null) return void (drag = null);
		const first = samples[0];
		const v = first && t > first.t ? (y - first.y) / (t - first.t) : 0;
		const base = detentOffset(largest, fullH);
		const to = snapDetent(Math.max(0, drag) + base, v, detents, fullH, dismissible);
		if (to === null) {
			close();
			return;
		}
		detent = to;
		drag = null;
	}

	// Mouse and pen: from the grabber and header only (the wheel scrolls the content).
	function pdown(e: PointerEvent) {
		if (e.pointerType === 'touch' || e.button !== 0) return;
		// A header button keeps its click: capturing here would send it to the header.
		if ((e.target as HTMLElement).closest('button, a, input')) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		begin(e.clientY, e.timeStamp, 'grab');
	}
	const pmove = (e: PointerEvent) => e.pointerType !== 'touch' && step(e.clientY, e.timeStamp, e.target);
	const pup = (e: PointerEvent) => e.pointerType !== 'touch' && end(e.clientY, e.timeStamp);

	// Touch: anywhere on the panel; the content scrolls unless the sheet takes the move.
	function tstart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const grab = (e.target as HTMLElement).closest('[data-sheet-grab]');
		begin(e.touches[0].clientY, e.timeStamp, grab ? 'grab' : 'content');
	}
	function tmove(e: TouchEvent) {
		if (step(e.touches[0].clientY, e.timeStamp, e.target) && e.cancelable) e.preventDefault();
	}
	const tend = (e: TouchEvent) => end(e.changedTouches[0]?.clientY ?? 0, e.timeStamp);

	// Not at its largest, scrolling up grows the sheet instead of the content.
	function wheel(e: WheelEvent) {
		if (atLargest || e.deltaY <= 0) return;
		e.preventDefault();
		const bigger = [...detents].sort((a, b) => share(a) - share(b)).find((d) => share(d) > share(current));
		if (bigger) detent = bigger;
	}
	function cycle() {
		const sorted = [...detents].sort((a, b) => share(a) - share(b));
		detent = sorted[(sorted.indexOf(current) + 1) % sorted.length];
	}

	function touchListeners(node: HTMLElement) {
		node.addEventListener('touchstart', tstart, { passive: true });
		node.addEventListener('touchmove', tmove, { passive: false });
		node.addEventListener('touchend', tend);
		node.addEventListener('touchcancel', tend);
		node.addEventListener('wheel', wheel, { passive: false });
		return () => {
			node.removeEventListener('touchstart', tstart);
			node.removeEventListener('touchmove', tmove);
			node.removeEventListener('touchend', tend);
			node.removeEventListener('touchcancel', tend);
			node.removeEventListener('wheel', wheel);
		};
	}

	function key(e: KeyboardEvent) {
		if (phase !== 'open' || !panel || !overlays.top(id)) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			const page = ctx.pages[ctx.pages.length - 1];
			if (page) page();
			else if (dismissible) close();
			return;
		}
		if (e.key === 'Tab') trapTab(e, panel);
	}

	const transform = $derived.by(() => {
		if (reduced) return under ? 'scale(0.94)' : 'none';
		if (hidden) return 'translateY(calc(100% + 40px + var(--sheet-lift, 0px)))';
		const y = `translateY(${offset}px)`;
		return under ? `${y} scale(0.94)` : y;
	});
	const duration = $derived(drag !== null ? '0ms' : phase === 'leaving' ? 'var(--dur-sheet-out)' : phase === 'open' && !start ? 'var(--dur-snap)' : 'var(--dur-sheet-in)');
</script>

<svelte:window onkeydown={key} onresize={measure} />

{#if phase !== 'closed'}
	<div class="ios-sheet-layer" class:under {@attach portal(() => screen?.el)}>
		<button class="scrim" class:shown={!hidden} aria-label={t('common.close')} tabindex="-1" onclick={() => dismissible && close()}></button>
		<div
			class="panel"
			class:reduced
			class:shown={!hidden}
			class:large={share(largest) >= 1}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			inert={under}
			bind:this={panel}
			style:height="calc((100% - var(--safe-top) - {10 + depth * 12}px) * {share(largest)})"
			style:transform
			style:transition-duration={duration}
			style:--sheet-below="{Math.max(0, offset)}px"
			{@attach touchListeners}
		>
			<div class="top" data-sheet-grab onpointerdown={pdown} onpointermove={pmove} onpointerup={pup} onpointercancel={pup} role="presentation">
				{#if detents.length > 1}
					<button type="button" class="grabber" aria-label={t('kit.sheet.resize')} onclick={cycle}><span></span></button>
				{:else if dismissible}
					<span class="grabber" aria-hidden="true"><span></span></span>
				{/if}
				{#if title || leading || trailing || done}
					<header class="head">
						<div class="side">{@render leading?.()}</div>
						<h2>{title ?? ''}</h2>
						<div class="side end">
							{@render trailing?.()}
							{#if done}<button type="button" class="done" onclick={close}>{done === true ? 'Done' : done}</button>{/if}
						</div>
					</header>
				{/if}
			</div>
			<div class="body" class:locked={!atLargest} data-sheet-scroll bind:this={scroller}>
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	.ios-sheet-layer {
		position: fixed;
		z-index: 40;
		inset: 0;
		pointer-events: none;
		--group-bg: var(--cell-elevated);
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: var(--scrim);
		opacity: 0;
		transition: opacity var(--dur-sheet-out) var(--ease-ios);
		pointer-events: auto;
		border: 0;
	}
	.scrim.shown {
		opacity: 1;
		transition-duration: var(--dur-sheet-in);
	}
	.under .scrim {
		opacity: 0;
	}
	/* The panel keeps to a column: 430 px on a phone screen, wider where the frame says so
	   (`--sheet-half`, NavShell). The scrim dims everything. */
	.panel {
		position: absolute;
		left: max(0px, calc(50% - var(--sheet-half, 215px)));
		right: max(0px, calc(50% - var(--sheet-half, 215px)));
		bottom: 0;
		display: flex;
		flex-direction: column;
		background: var(--mat-sheet);
		-webkit-backdrop-filter: var(--mat-blur);
		backdrop-filter: var(--mat-blur);
		border-radius: 32px 32px 0 0;
		box-shadow: var(--shadow-3);
		pointer-events: auto;
		overflow: hidden;
		transform-origin: 50% 0;
		transition-property: transform, opacity, filter;
		transition-timing-function: var(--ease-ios);
		will-change: transform;
		outline: none;
	}
	.under .panel {
		filter: brightness(0.7);
	}
	/* With an iPad's room a full sheet is a form sheet: a card in the middle, clear of the edges.
	   A sheet with smaller detents stays on the foot. `--sheet-lift` is how far it sits above the
	   foot, so it still leaves all the way down. */
	@media (min-width: 700px) and (min-height: 640px) {
		.panel.large {
			--sheet-h: min(720px, calc(100dvh - 96px));
			--sheet-lift: calc((100dvh - var(--sheet-h)) / 2);
			height: var(--sheet-h) !important;
			bottom: var(--sheet-lift);
			border-radius: 32px;
			box-shadow: var(--shadow-3);
		}
	}
	.panel.reduced {
		opacity: 0;
		transition-duration: 150ms !important;
	}
	.panel.reduced.shown {
		opacity: 1;
	}
	.top {
		flex: none;
		touch-action: none;
		cursor: grab;
	}
	.grabber {
		display: flex;
		justify-content: center;
		width: 100%;
		height: 16px;
		padding-top: 5px;
		cursor: grab;
	}
	.grabber span {
		width: 36px;
		height: 5px;
		border-radius: 2.5px;
		background: var(--label-3);
	}
	.head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		min-height: 44px;
		padding: 0 16px 6px;
		gap: 8px;
	}
	.head h2 {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		letter-spacing: -0.43px;
		text-align: center;
		max-width: 210px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.side {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.side.end {
		justify-content: flex-end;
	}
	.done {
		height: 44px;
		padding: 0 4px;
		margin-right: -4px;
		color: var(--tint);
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.43px;
		transition: opacity var(--dur-press);
	}
	.done:active {
		opacity: 0.4;
		transition: none;
	}
	.body {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 8px 0 calc(24px + var(--safe-bottom));
	}
	.body.locked {
		overflow-y: hidden;
	}
</style>
