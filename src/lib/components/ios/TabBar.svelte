<script lang="ts">
	// The tab bar: the classic iOS 17 bar, full width at the foot of the column, bar material and
	// a top hairline, safe-area padding. Screen's scroll leaves room for it (`--tabbar-space`).
	// Stays put through push and pop (its own View Transition name).
	import type { Component } from 'svelte';
	import { t } from '$lib/i18n/messages';

	let { items, active }: { items: { href: string; label: string; icon: Component<{ class?: string; strokeWidth?: number }> }[]; active: string } = $props();

	$effect(() => {
		const root = document.documentElement;
		root.style.setProperty('--tabbar-space', 'calc(49px + var(--safe-bottom))');
		return () => root.style.removeProperty('--tabbar-space');
	});
</script>

<nav class="ios-tabbar material-bar" aria-label={t('kit.tabs')}>
	{#each items as item (item.href)}
		{@const on = item.href === active}
		<a href={item.href} class="tab" class:on aria-current={on ? 'page' : undefined}>
			<item.icon class="size-[25px]" strokeWidth={on ? 2.3 : 1.8} />
			<span>{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	.ios-tabbar {
		position: fixed;
		z-index: 25;
		left: max(0px, calc(50% - 215px));
		right: max(0px, calc(50% - 215px));
		bottom: 0;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		padding: 0 max(8px, env(safe-area-inset-right)) var(--safe-bottom) max(8px, env(safe-area-inset-left));
		box-shadow: 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: 49px;
		padding-top: 2px;
		color: var(--label-2);
		font-size: 10px;
		line-height: 12px;
		font-weight: 500;
		letter-spacing: 0.1px;
		transition: opacity var(--dur-press);
	}
	.tab.on {
		color: var(--tint);
	}
	.tab:active {
		opacity: 0.5;
		transition: none;
	}
</style>
