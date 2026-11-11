<script lang="ts">
	// The action rail: the capture buttons on the screen edge under the holding thumb. On a side
	// edge they sit from a third to half way down (Start's middle at a third, Photo's at half),
	// `more` under them past a rule, in the same thumb's sweep but a clear step away, and `top`
	// out of the way in the corner. Along the foot (compact) capture is on the hand's side. In a
	// short window (a phone on its side) the rail is two columns: capture on the edge, the rest
	// beside it. The left hand is the exact mirror. Sizes come from the Workspace's `--target`
	// and `--gap` (ios/target.ts).
	//
	// Nothing starts on the rail but a press: no scroll, pinch, selection, callout or menu. The
	// targets keep 14 px and the safe area between them and the screen edge, where the system
	// takes its own swipes and the holding palm rests.
	//
	// A running take (`rolling`) shows as a bar on the rail's inner edge, breathing with the
	// start button's outline. Motion
	// only follows; `data-motion="reduced"` on the root stills it and the bar stays.
	import type { Snippet } from 'svelte';
	import type { WorkspaceLayout } from '$lib/ios/handedness';
	import { radioStep } from '$lib/ios/keys';

	let {
		edge,
		label,
		rolling = false,
		top,
		capture,
		more
	}: { edge: WorkspaceLayout['rail']; label: string; rolling?: boolean; top?: Snippet; capture: Snippet; more?: Snippet } = $props();

	let el = $state<HTMLElement | null>(null);

	// What the browser would start on a long press, a drag or two fingers: none of it here.
	$effect(() => {
		if (!el) return;
		const rail = el;
		const stop = (e: Event) => e.preventDefault();
		const events = ['contextmenu', 'dragstart', 'selectstart', 'gesturestart'];
		events.forEach((name) => rail.addEventListener(name, stop));
		return () => events.forEach((name) => rail.removeEventListener(name, stop));
	});

	/** A toolbar: the arrows, Home and End move between its buttons; Tab still visits each. */
	function onkeydown(e: KeyboardEvent) {
		if (!el || e.ctrlKey || e.metaKey || e.altKey) return;
		const buttons = [...el.querySelectorAll<HTMLButtonElement>('button')];
		const to = radioStep(
			e.key,
			buttons.indexOf(document.activeElement as HTMLButtonElement),
			buttons.map((b) => !b.disabled)
		);
		if (to === null) return;
		e.preventDefault();
		buttons[to].focus();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_interactive_supports_focus -->
<div
	class="ios-rail"
	data-edge={edge}
	class:rolling
	role="toolbar"
	aria-label={label}
	aria-orientation={edge.startsWith('bottom') ? 'horizontal' : 'vertical'}
	bind:this={el}
	{onkeydown}
>
	{#if top}<div class="top">{@render top()}</div>{/if}
	<div class="band">
		<div class="capture">{@render capture()}</div>
		{#if more}<div class="more">{@render more()}</div>{/if}
	</div>
</div>

<style>
	.ios-rail {
		--pad: 14px;
		/* Start with its two lines, Photo with its one, the space between. */
		--capture-h: calc(2 * var(--target) + var(--gap) + 65px);
		/* The rule between capture and the rest, with room on both sides. */
		--step: calc(var(--gap) + 12px);
		/* Two small buttons with their words. */
		--more-h: calc(154px + var(--gap));
		--bar: 5px;
		--breathe: ios-rail-breathe 1.6s ease-in-out infinite alternate;

		position: relative;
		height: 100%;
		width: calc(var(--target) + 2 * var(--pad));
		box-sizing: content-box;
		background: var(--bg-elevated);
		touch-action: none;
		overscroll-behavior: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(:root:not([data-motion='full'])) .ios-rail {
			--breathe: none;
		}
	}
	:global(:root[data-motion='reduced']) .ios-rail {
		--breathe: none;
	}
	.ios-rail[data-edge='right'] {
		padding-right: env(safe-area-inset-right, 0px);
		border-left: var(--hairline) solid var(--separator);
	}
	.ios-rail[data-edge='left'] {
		padding-left: env(safe-area-inset-left, 0px);
		border-right: var(--hairline) solid var(--separator);
	}

	/* A running take shows on the rail's inner edge too: a solid bar, the full length of the rail. */
	.ios-rail::before {
		content: '';
		position: absolute;
		background: var(--record);
		opacity: 0;
		pointer-events: none;
	}
	.ios-rail[data-edge='right']::before {
		inset: 0 auto 0 0;
		width: var(--bar);
	}
	.ios-rail[data-edge='left']::before {
		inset: 0 0 0 auto;
		width: var(--bar);
	}
	.ios-rail[data-edge^='bottom']::before {
		inset: 0 0 auto 0;
		height: var(--bar);
	}
	.ios-rail.rolling::before {
		opacity: 1;
		animation: var(--breathe);
	}
	@keyframes ios-rail-breathe {
		from {
			opacity: 1;
		}
		to {
			opacity: 0.45;
		}
	}

	.top {
		position: absolute;
		top: 12px;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
	}
	.ios-rail[data-edge='right'] .top {
		right: env(safe-area-inset-right, 0px);
	}
	.ios-rail[data-edge='left'] .top {
		left: env(safe-area-inset-left, 0px);
	}
	.band {
		position: absolute;
		left: 0;
		right: 0;
		/* The middle of the two capture targets at 43 % of the height: Start at a third down,
		   Photo at half. Never over `top`; in a short window it moves up before anything leaves
		   the foot or goes under the home indicator. */
		top: clamp(
			104px,
			calc(43% - var(--capture-h) / 2),
			calc(100% - var(--capture-h) - var(--step) - var(--more-h) - 12px - env(safe-area-inset-bottom, 0px))
		);
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.ios-rail[data-edge='right'] .band {
		right: env(safe-area-inset-right, 0px);
	}
	.ios-rail[data-edge='left'] .band {
		left: env(safe-area-inset-left, 0px);
	}
	.capture,
	.more {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--gap);
	}
	/* The rest: a step away past a rule, so a thumb aiming at Photo does not land on New take. */
	.more {
		position: relative;
		margin-top: var(--step);
	}
	.more::before {
		content: '';
		position: absolute;
		top: calc(var(--step) / -2);
		left: 50%;
		width: 40px;
		height: 2px;
		margin-left: -20px;
		border-radius: 1px;
		background: var(--separator);
	}

	/* A short window, a phone on its side: two columns. Capture on the edge, the rest beside it. */
	@media (max-height: 640px) {
		.ios-rail:not([data-edge^='bottom']) {
			width: calc(var(--target) + 64px + 3 * var(--pad));
		}
		.ios-rail:not([data-edge^='bottom']) .band {
			top: 12px;
			bottom: calc(12px + env(safe-area-inset-bottom, 0px));
			flex-direction: row-reverse;
			align-items: flex-start;
			justify-content: center;
			gap: var(--pad);
		}
		.ios-rail[data-edge='left'] .band {
			flex-direction: row;
		}
		.ios-rail:not([data-edge^='bottom']) .more {
			margin-top: 89px;
		}
		.ios-rail:not([data-edge^='bottom']) .more::before {
			display: none;
		}
		.ios-rail[data-edge='right'] .top {
			left: var(--pad);
			right: auto;
			width: 64px;
		}
		.ios-rail[data-edge='left'] .top {
			right: var(--pad);
			left: auto;
			width: 64px;
		}
	}

	/* Along the foot. */
	.ios-rail[data-edge^='bottom'] {
		--rail-btn-w: 56px;
		display: flex;
		align-items: flex-start;
		gap: var(--gap);
		width: auto;
		height: auto;
		padding: 14px calc(var(--pad) + env(safe-area-inset-right, 0px)) calc(6px + var(--safe-bottom, 0px)) calc(var(--pad) + env(safe-area-inset-left, 0px));
		border-top: var(--hairline) solid var(--separator);
	}
	.ios-rail[data-edge='bottom-left'] {
		flex-direction: row-reverse;
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
	/* The two small buttons: 3 mm apart where there is room, never under 8 px (gloves on a phone). */
	[data-edge^='bottom'] .more {
		margin-top: 0;
		gap: clamp(8px, calc(100vw - 2 * var(--target) - 172px), var(--gap));
	}
	[data-edge^='bottom'] .more::before {
		display: none;
	}
	/* Right hand: Start at the right end, Photo next to it, the rest toward the middle. */
	[data-edge='bottom-right'] .band,
	[data-edge='bottom-right'] .capture {
		flex-direction: row-reverse;
	}
	[data-edge='bottom-left'] .more {
		flex-direction: row-reverse;
	}
</style>
