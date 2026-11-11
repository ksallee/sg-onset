<script lang="ts">
	// What was just done, with one action (Undo). A pill at the foot of the page, in the middle:
	// clear of the side edges, where the thumbs and the action rail are.
	//
	// Motion (docs/design/motion.md). One pill, never a pile: Undo takes back the last edit only,
	// so a second pill would lie. It comes up from the foot and leaves the way it came, sooner.
	// A new edit while it shows changes it in place: the words swap, the pill takes its new width
	// from the old one, and when the words are the same (`stamp` alone changed) it gives a small
	// pulse, so every edit is seen to land. Reduced motion: it fades, the words just change.
	import type { Snippet } from 'svelte';
	import { springProgress } from '$lib/ios/spring';
	import { DURATIONS, SPRINGS, springCss } from '$lib/theme/motion';
	import { reducedMotion } from './layer.svelte';
	import { rise } from './motion';

	let {
		text,
		action,
		onaction,
		stamp,
		instant,
		children
	}: {
		text: string;
		action?: string;
		onaction?: () => void;
		/** Changes with every edit (its time): the pill answers even when the words stay the same. */
		stamp?: unknown;
		/** True when it should come and go with no motion (the capture path: nothing there waits on
		 *  an animation). A function, asked as it comes or goes: by then its props no longer change. */
		instant?: () => boolean;
		children?: Snippet;
	} = $props();

	let pill = $state<HTMLElement | null>(null);
	let seen: { text: string; stamp: unknown; width: number } | null = null;
	let morph: Animation[] = [];

	/** The words as they change: the new come up, the old go up and out, out of the layout. */
	function swap(_node: Element, { out = false }: { out?: boolean } = {}) {
		if (reducedMotion()) return { duration: 0 };
		return {
			duration: out ? DURATIONS.fade : DURATIONS.exit,
			css: (t: number, u: number) => `${out ? 'position: absolute; left: 0; top: 8px;' : ''} opacity: ${t}; transform: translate3d(0, ${(out ? -6 : 6) * u}px, 0)`
		};
	}

	$effect(() => {
		const now = { text, stamp };
		if (!pill) return;
		const width = pill.offsetWidth;
		const was = seen;
		seen = { ...now, width };
		if (!was || reducedMotion() || typeof pill.animate !== 'function') return;
		for (const a of morph) a.cancel();
		morph = [];
		if (was.text !== now.text && Math.abs(was.width - width) >= 1) {
			// The new width from the old: the pill scales, what it holds scales back by as much on
			// every frame, so nothing in it is stretched.
			const { duration } = springCss('smooth');
			const steps = 12;
			const at = (i: number) => {
				const p = springProgress(SPRINGS.smooth, (duration / 1000) * (i / steps));
				return (was.width + (width - was.width) * (i === steps ? 1 : p)) / width;
			};
			const frames = Array.from({ length: steps + 1 }, (_, i) => at(i));
			morph.push(pill.animate(frames.map((s) => ({ transform: `scaleX(${s})` })), { duration }));
			[...pill.children].forEach((child, i, all) => {
				const origin = i === all.length - 1 && all.length > 1 ? 'right center' : 'left center';
				morph.push(child.animate(frames.map((s) => ({ transform: `scaleX(${1 / s})`, transformOrigin: origin })), { duration }));
			});
		} else if (was.stamp !== now.stamp && was.text === now.text) {
			morph.push(pill.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: springCss('snappy').duration, easing: 'ease-out' }));
		}
	});
</script>

<div class="ios-notice" role="status" in:rise|global={{ y: 14, instant: instant?.() }} out:rise|global={{ y: 10, exit: true, instant: instant?.() }}>
	<div class="pill" bind:this={pill}>
		<span class="text">
			{#key text}<span class="line" in:swap out:swap={{ out: true }}>{text}</span>{/key}
		</span>
		{@render children?.()}
		{#if action && onaction}<button type="button" onclick={onaction}>{action}</button>{/if}
	</div>
</div>

<style>
	.ios-notice {
		position: absolute;
		z-index: 35;
		left: 0;
		right: 0;
		bottom: calc(16px + var(--safe-bottom));
		display: flex;
		justify-content: center;
		padding: 0 16px;
		pointer-events: none;
	}
	.pill {
		display: flex;
		align-items: center;
		gap: 12px;
		width: max-content;
		max-width: min(520px, 100%);
		min-height: 52px;
		padding: 4px 4px 4px 18px;
		border-radius: 26px;
		background: var(--cell-elevated);
		color: var(--label);
		box-shadow: var(--shadow-2);
		font-size: 16px;
		line-height: 21px;
		font-weight: 600;
		letter-spacing: -0.31px;
		pointer-events: auto;
	}
	.text {
		position: relative;
		flex: 1;
		min-width: 0;
		display: grid;
		padding: 8px 14px 8px 0;
	}
	.line {
		grid-area: 1 / 1;
		min-width: 0;
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
		transition: opacity var(--dur-press);
	}
	button:active {
		opacity: 0.6;
		transition: none;
	}
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
</style>
