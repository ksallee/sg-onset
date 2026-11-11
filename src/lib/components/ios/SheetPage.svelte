<script lang="ts">
	// A drill-in inside the nearest Sheet: slides in from the right over the sheet's content, with a
	// back button naming where it came from. Put it anywhere inside the Sheet; it portals into the
	// panel. Escape or back closes it. Nests: a SheetPage inside one drills in again.
	import { onDestroy, type Snippet } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';
	import { backLabel } from '$lib/ios/back';
	import { getSheet, portal, reducedMotion, setSheet } from './layer.svelte';

	let {
		open = $bindable(false),
		title,
		trailing,
		footer,
		children
	}: {
		open?: boolean;
		title: string;
		trailing?: Snippet;
		/** Pinned under the scrolling content: the page's actions. */
		footer?: Snippet;
		children: Snippet;
	} = $props();

	const sheet = getSheet();
	const back = backLabel(sheet?.backLabel ?? 'Back');
	setSheet({
		get panel() {
			return sheet?.panel ?? null;
		},
		get backLabel() {
			return title;
		},
		get pages() {
			return sheet?.pages ?? [];
		},
		set pages(v) {
			if (sheet) sheet.pages = v;
		}
	});

	let phase = $state<'closed' | 'entering' | 'open' | 'leaving'>('closed');
	let el = $state<HTMLElement | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const reduced = reducedMotion();
	const pop = () => (open = false);

	$effect(() => {
		if (open && (phase === 'closed' || phase === 'leaving')) {
			clearTimeout(timer);
			if (phase === 'closed') sheet?.pages.push(pop);
			phase = 'entering';
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (phase !== 'entering') return;
					phase = 'open';
					el?.focus({ preventScroll: true });
				})
			);
		} else if (!open && (phase === 'open' || phase === 'entering')) {
			phase = 'leaving';
			timer = setTimeout(
				() => {
					phase = 'closed';
					if (sheet) sheet.pages = sheet.pages.filter((p) => p !== pop);
				},
				reduced ? 150 : 400
			);
		}
	});
	onDestroy(() => {
		clearTimeout(timer);
		if (sheet) sheet.pages = sheet.pages.filter((p) => p !== pop);
	});
</script>

{#if phase !== 'closed'}
	<div class="ios-sheet-page" class:shown={phase === 'open'} class:reduced role="group" aria-label={title} tabindex="-1" bind:this={el} {@attach portal(() => sheet?.panel)}>
		<header class="head" data-sheet-grab>
			<button type="button" class="back" onclick={pop}><ChevronLeft class="size-[26px] shrink-0" strokeWidth={2.4} /><span>{back}</span></button>
			<h2>{title}</h2>
			<div class="end">{@render trailing?.()}</div>
		</header>
		<div class="body" class:footed={!!footer} data-sheet-scroll>{@render children()}</div>
		{#if footer}<div class="foot">{@render footer()}</div>{/if}
	</div>
{/if}

<style>
	.ios-sheet-page {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		flex-direction: column;
		padding-top: 16px;
		background: var(--bg-elevated);
		transform: translateX(100%);
		transition: transform var(--dur-push) var(--ease-ios);
		outline: none;
		box-shadow: -8px 0 24px rgb(0 0 0 / 0.2);
	}
	.ios-sheet-page.shown {
		transform: none;
	}
	.ios-sheet-page.reduced {
		transform: none;
		opacity: 0;
		transition: opacity 150ms;
	}
	.ios-sheet-page.reduced.shown {
		opacity: 1;
	}
	.head {
		flex: none;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		min-height: 44px;
		padding: 0 16px 6px 8px;
		gap: 8px;
		touch-action: none;
	}
	.head h2 {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		letter-spacing: -0.43px;
		text-align: center;
		max-width: 190px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.back {
		display: flex;
		align-items: center;
		height: 44px;
		min-width: 0;
		color: var(--tint);
		font-size: 17px;
		letter-spacing: -0.43px;
		transition: opacity var(--dur-press);
	}
	.back span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.back:active {
		opacity: 0.4;
		transition: none;
	}
	.end {
		display: flex;
		justify-content: flex-end;
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 8px 0 calc(24px + var(--safe-bottom));
	}
	.body.footed {
		padding-bottom: 16px;
	}
	.foot {
		flex: none;
		padding: 12px 16px calc(12px + var(--safe-bottom));
		background: var(--bg-elevated);
		box-shadow: 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
</style>
