<script lang="ts">
	// A sheet with detents (medium, large, or a share of the height). Drag the grabber or header to
	// move it; drag the content when it is scrolled to the top or not at its largest detent. On
	// release ios/detent.ts snapDetent picks the detent or dismisses (a third down, or a flick).
	// The scroll wheel or a scroll up at a smaller detent grows it. A modal dialog: focus moves in,
	// Tab stays inside (keys.ts trapStep), Escape closes the innermost drill-in, then the sheet.
	// A sheet opened over another scales the one under it back. Portals into the Screen.
	// `--sheet-below` on the panel: how far its foot sits below the screen (a smaller detent), so
	// something pinned to the foot (SheetPlayer) can stay in sight.
	//
	// Motion (docs/design/motion.md). One spring moves the sheet (motion.ts springDriver): it comes
	// up, snaps and leaves from where it is at the speed it has, so a finger can catch it on its
	// way and the release carries on at the finger's speed. Under the finger it follows 1:1;
	// past its largest detent, and under its smallest when it cannot be dismissed, it resists
	// (ios/gesture.ts rubberband). The scrim's dim goes with the sheet's way down. The spring writes
	// the transform straight to the panel: no state, no layout. A leaving sheet takes no touch,
	// so what is under it answers at once. Reduced motion: it fades, in place.
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { detentOffset, snapDetent, type Detent } from '$lib/ios/detent';
	import { dimProgress, releaseVelocity, rubberband, type Sample } from '$lib/ios/gesture';
	import { getScreen, holdFocus, overlays, portal, reducedMotion, setSheet, trapTab } from './layer.svelte';
	import { springDriver } from './motion';
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
	/** How far down the panel must go to be out of sight, px. */
	let hiddenY = 900;
	let phase = $state<'closed' | 'open' | 'leaving'>('closed');
	let id = 0;
	/** Overlays open under this one when it came up: a stacked sheet sits lower, so the one under peeks out. */
	let depth = $state(0);
	/** Reduced motion, as it was when the sheet came up: it fades (`shown`) and nothing slides. */
	let reduced = $state(false);
	let shown = $state(false);
	let scrim = $state<HTMLElement | null>(null);

	const offsetOf = (d: Detent) => detentOffset(d, fullH) - detentOffset(largest, fullH);
	const restOffset = $derived(offsetOf(current));
	/** The lowest detent's offset: the scrim is whole down to it. */
	const lowest = $derived(Math.max(...detents.map(offsetOf), 0));
	const under = $derived(id && phase === 'open' ? overlays.above(id) > 0 : false);

	/** A finger has the sheet. */
	let dragging = false;
	/** The finger's speed when it let go and the sheet was dismissed, px per second. */
	let fling: number | undefined;

	// px the panel sits below its largest detent. The one thing that moves it.
	const sheet = springDriver(
		'sheet',
		(y) => {
			if (!panel) return;
			panel.style.transform = `translate3d(0, ${y}px, 0)`;
			if (scrim && !reduced) scrim.style.opacity = String(dimProgress(y, lowest, hiddenY));
		},
		() => {
			if (phase === 'leaving') finish();
		}
	);

	function measure() {
		if (!panel) return;
		fullH = panel.offsetHeight / share(largest);
		// Its top at the largest detent, whatever it is doing now, down to under the window's foot.
		hiddenY = window.innerHeight - (panel.getBoundingClientRect().top - sheet.x) + 40;
	}
	function resized() {
		measure();
		if (phase === 'open' && !dragging && !sheet.moving) sheet.jump(restOffset);
	}

	let release: (() => void) | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (open && (phase === 'closed' || phase === 'leaving')) present();
		else if (!open && phase === 'open') dismissNow();
	});
	// A new detent (a tap on the grabber, the wheel, the owner): the sheet goes there.
	$effect(() => {
		const to = restOffset;
		untrack(() => {
			if (phase === 'open' && panel && !dragging) sheet.to(to);
		});
	});

	function present() {
		clearTimeout(timer);
		const back = phase === 'leaving';
		if (phase === 'closed') {
			id = overlays.open();
			depth = overlays.ids.length - 1;
			reduced = reducedMotion();
		}
		if (!detent || !detents.includes(detent)) detent = detents[0] ?? 'large';
		phase = 'open';
		// It was on its way out: it turns around from where it is.
		if (back && panel) {
			shown = true;
			if (!reduced) sheet.to(restOffset);
		}
	}
	/** The panel is in the page: it starts out of sight and comes up (or, reduced, fades in). */
	function arrived(node: HTMLElement) {
		untrack(() => {
			panel = node;
			sheet.jump(0);
			measure();
			if (reduced) {
				sheet.jump(restOffset);
				requestAnimationFrame(() => (shown = phase === 'open'));
			} else {
				sheet.jump(hiddenY);
				sheet.to(restOffset);
			}
			if (!release) release = holdFocus(node);
		});
		return () => {
			sheet.stop();
			if (panel === node) panel = null;
		};
	}
	function dismissNow() {
		phase = 'leaving';
		dragging = false;
		start = null;
		clearTimeout(timer);
		if (reduced || !panel) {
			shown = false;
			timer = setTimeout(finish, reduced ? 150 : 0);
		} else {
			sheet.to(hiddenY, fling);
		}
		fling = undefined;
	}
	function finish() {
		if (phase !== 'leaving') return;
		phase = 'closed';
		sheet.stop();
		overlays.close(id);
		id = 0;
		release?.();
		release = null;
		onclose?.();
	}
	function close() {
		open = false;
	}
	onDestroy(() => {
		clearTimeout(timer);
		sheet.stop();
		if (id) overlays.close(id);
	});

	// ---- drag
	let start: { y: number; off: number; from: 'grab' | 'content' } | null = null;
	let mode: 'undecided' | 'drag' | 'scroll' = 'undecided';
	let samples: Sample[] = [];

	function begin(y: number, t: number, from: 'grab' | 'content') {
		if (phase !== 'open') return;
		measure();
		// From where it is drawn: a sheet caught on its way starts under the finger.
		start = { y, off: sheet.x, from };
		mode = 'undecided';
		samples = [{ p: y, t }];
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
		dragging = true;
		samples.push({ p: y, t });
		if (samples.length > 12) samples.shift();
		let next = start.off + dy;
		// Past its largest detent it resists; so does a sheet that cannot be dismissed, under its smallest.
		if (next < 0) next = rubberband(next, fullH);
		else if (!dismissible && next > lowest) next = lowest + rubberband(next - lowest, fullH);
		sheet.jump(next);
		return true;
	}
	function end(y: number, t: number) {
		if (!start) return;
		const was = mode;
		start = null;
		mode = 'undecided';
		if (was !== 'drag' || !dragging) return;
		dragging = false;
		samples.push({ p: y, t });
		const v = releaseVelocity(samples, t);
		const base = detentOffset(largest, fullH);
		const to = snapDetent(Math.max(0, sheet.x) + base, v / 1000, detents, fullH, dismissible);
		if (to === null) {
			fling = v;
			close();
			return;
		}
		// On from the finger's speed, to the detent.
		detent = to;
		if (reduced) sheet.jump(offsetOf(to));
		else sheet.to(offsetOf(to), v);
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

</script>

<svelte:window onkeydown={key} onresize={resized} />

{#if phase !== 'closed'}
	<div class="ios-sheet-layer" class:under class:leaving={phase === 'leaving'} {@attach portal(() => screen?.el)}>
		<button class="scrim" class:reduced class:shown aria-label={t('common.close')} tabindex="-1" onclick={() => dismissible && close()} bind:this={scrim}></button>
		<div
			class="panel"
			class:reduced
			class:shown
			class:large={share(largest) >= 1}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			inert={under}
			style:height="calc((100% - var(--safe-top) - {10 + depth * 12}px) * {share(largest)})"
			style:--sheet-below="{Math.max(0, restOffset)}px"
			{@attach arrived}
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
	/* The dim goes with the sheet: the spring writes its opacity (script). */
	.scrim {
		position: absolute;
		inset: 0;
		background: var(--scrim);
		opacity: 0;
		pointer-events: auto;
		border: 0;
	}
	.under .scrim {
		opacity: 0 !important;
	}
	/* A sheet on its way out takes no touch: what is under it answers at once. */
	.leaving .scrim,
	.leaving .panel {
		pointer-events: none;
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
		/* The last shadow is more of the sheet under its foot: pulled up past its top, no gap shows. */
		box-shadow: var(--shadow-3), 0 240px 0 var(--mat-sheet-solid);
		pointer-events: auto;
		overflow: hidden;
		transform-origin: 50% 0;
		/* Out of sight until the spring places it (script). */
		transform: translate3d(0, 110vh, 0);
		transition: scale var(--dur-smooth) var(--spring-smooth);
		will-change: transform;
		outline: none;
	}
	/* Under another sheet: back a little, and darker (a veil, so only its opacity changes). */
	.under .panel {
		scale: 0.94;
	}
	.panel::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 10;
		background: #000;
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--dur-smooth) var(--spring-smooth);
	}
	.under .panel::after {
		opacity: 0.3;
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
	/* Reduced motion: the sheet and its dim fade, in place. */
	.panel.reduced,
	.scrim.reduced {
		opacity: 0;
		transition: opacity var(--dur-fade) linear !important;
	}
	.panel.reduced.shown,
	.scrim.reduced.shown {
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
