<script lang="ts">
	// The navigation bar: back, an inline title, trailing buttons; `large` adds the large title
	// under it, which scrolls under the bar (the inline title fades in once it has). Transparent
	// at the top, bar material once content is under it. Sticky at the top of Screen's scroll.
	// An empty title renders no heading: a page whose record is loading has no title yet.
	import type { Snippet } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';
	import { backLabel } from '$lib/ios/back';
	import { barScrolled, titleProgress } from '$lib/ios/largeTitle';
	import { getScreen } from './layer.svelte';

	let {
		title,
		large = false,
		back,
		leading,
		trailing,
		ontitle
	}: {
		title: string;
		large?: boolean;
		back?: { href?: string; label: string; onclick?: () => void };
		leading?: Snippet;
		trailing?: Snippet;
		/** The inline title becomes a button (a document's name that opens its settings). */
		ontitle?: () => void;
	} = $props();

	const screen = getScreen();
	const y = $derived(screen?.scrollY ?? 0);
	const progress = $derived(large ? titleProgress(y) : 1);
	const scrolled = $derived(barScrolled(y, large));
</script>

<header class="ios-navbar" class:scrolled>
	<div class="bar">
		<div class="side lead">
			{#if back}
				{#if back.href}
					<a class="back" href={back.href} onclick={back.onclick}><ChevronLeft class="size-[26px] shrink-0" strokeWidth={2.4} /><span>{backLabel(back.label)}</span></a>
				{:else}
					<button type="button" class="back" onclick={back.onclick}><ChevronLeft class="size-[26px] shrink-0" strokeWidth={2.4} /><span>{backLabel(back.label)}</span></button>
				{/if}
			{/if}
			{@render leading?.()}
		</div>
		{#if large}<span class="inline-title" style:opacity={progress >= 1 ? 1 : 0} aria-hidden="true">{title}</span>{:else if ontitle}<h1 class="inline-title"><button type="button" class="title-btn" onclick={ontitle}>{title}</button></h1>{:else}<h1 class="inline-title">{title}</h1>{/if}
		<div class="side trail">{@render trailing?.()}</div>
	</div>
</header>
{#if large && title}
	<h1 class="large-title" style:opacity={1 - progress * 0.9}>{title}</h1>
{:else if large}
	<!-- No title yet (a record still loading): the room for it, and no empty heading. -->
	<div class="large-title" aria-hidden="true">&nbsp;</div>
{/if}

<style>
	.ios-navbar {
		position: sticky;
		top: 0;
		z-index: 20;
		flex: none;
		padding-top: var(--safe-top);
		transition: background-color var(--dur-reveal), box-shadow var(--dur-reveal);
	}
	.ios-navbar.scrolled {
		background: var(--mat-bar);
		-webkit-backdrop-filter: var(--mat-blur);
		backdrop-filter: var(--mat-blur);
		box-shadow: 0 var(--hairline) 0 var(--separator);
	}
	.bar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		height: 44px;
		/* In a Page the bar's content keeps to the page's column. */
		max-width: var(--page-w, none);
		margin: 0 auto;
		padding: 0 calc(var(--page-margin, 16px) - 8px);
	}
	.side {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.trail {
		justify-content: flex-end;
	}
	.inline-title {
		max-width: 200px;
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		letter-spacing: -0.43px;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: opacity var(--dur-reveal);
	}
	.title-btn {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: opacity var(--dur-press);
	}
	.title-btn:active {
		opacity: 0.4;
		transition: none;
	}
	.back {
		display: flex;
		align-items: center;
		height: 44px;
		min-width: 44px;
		margin-left: -6px;
		padding-right: 8px;
		color: var(--tint);
		font-size: 17px;
		letter-spacing: -0.43px;
		min-width: 0;
		transition: opacity var(--dur-press);
	}
	.back span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 110px;
	}
	.back:active {
		opacity: 0.4;
		transition: none;
	}
	.large-title {
		flex: none;
		padding: 2px calc(var(--page-margin, 16px) + var(--title-inset, 0px)) 8px;
		font-size: 34px;
		line-height: 41px;
		font-weight: 700;
		letter-spacing: 0.37px;
	}
</style>
