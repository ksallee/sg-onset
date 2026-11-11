<script lang="ts">
	// A pull-down menu (bits-ui DropdownMenu, restyled as iOS's): rows of 44 px, label left, icon
	// right, destructive in red, a thicker gap before an item with `section`. `trigger` gets the
	// props to spread on your button: {#snippet trigger(props)}<button {...props}>…</button>{/snippet}.
	// Positioned `absolute` against the Screen it portals into: `fixed` lands outside the desktop
	// phone frame, whose transformed body floating-ui does not see as the containing block.
	import type { Component, Snippet } from 'svelte';
	import { DropdownMenu } from 'bits-ui';
	import { getScreen } from './layer.svelte';

	type Item = { label: string; icon?: Component<{ class?: string }>; destructive?: boolean; disabled?: boolean; section?: boolean; run: () => void };
	let {
		items,
		trigger,
		open = $bindable(false),
		align = 'end'
	}: { items: Item[]; trigger: Snippet<[Record<string, unknown>]>; open?: boolean; align?: 'start' | 'center' | 'end' } = $props();
	const screen = getScreen();
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}{@render trigger(props)}{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal to={screen?.el ?? undefined}>
		<DropdownMenu.Content class="ios-menu" {align} strategy="absolute" sideOffset={6} collisionPadding={8}>
			{#each items as item, i (item.label)}
				{#if item.section && i > 0}<div class="ios-menu-gap" role="separator"></div>{/if}
				<DropdownMenu.Item class="ios-menu-item {item.destructive ? 'red' : ''}" disabled={item.disabled} onSelect={item.run}>
					<span class="ios-menu-label">{item.label}</span>
					{#if item.icon}<item.icon class="size-[19px] shrink-0" />{/if}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	:global(.ios-menu) {
		z-index: 60;
		min-width: 250px;
		max-width: min(300px, calc(100vw - 16px));
		border-radius: 13px;
		overflow: hidden;
		background: var(--mat-bar);
		-webkit-backdrop-filter: blur(40px) saturate(180%);
		backdrop-filter: blur(40px) saturate(180%);
		box-shadow: 0 10px 40px rgb(0 0 0 / 0.35), 0 0 0 var(--hairline) var(--separator);
		transform-origin: var(--bits-dropdown-menu-content-transform-origin);
		animation: ios-menu-in 250ms var(--ease-ios);
		outline: none;
	}
	:global(.ios-menu[data-state='closed']) {
		animation: ios-menu-out 150ms ease forwards;
	}
	:global(.ios-menu-item) {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 11px 16px;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		cursor: default;
		outline: none;
		user-select: none;
	}
	:global(.ios-menu-item:last-child) {
		box-shadow: none;
	}
	:global(.ios-menu-item[data-highlighted]) {
		background: var(--fill-3);
	}
	:global(.ios-menu-item[data-disabled]) {
		color: var(--label-3);
	}
	:global(.ios-menu-item.red) {
		color: var(--destructive);
	}
	:global(.ios-menu-label) {
		flex: 1;
		min-width: 0;
	}
	:global(.ios-menu-gap) {
		height: 8px;
		background: rgb(0 0 0 / 0.16);
	}
	@keyframes -global-ios-menu-in {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
	}
	@keyframes -global-ios-menu-out {
		to {
			opacity: 0;
			transform: scale(0.9);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.ios-menu) {
			animation: ios-menu-fade 150ms ease;
		}
	}
	@keyframes -global-ios-menu-fade {
		from {
			opacity: 0;
		}
	}
</style>
