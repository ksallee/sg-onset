<script lang="ts">
	// A pull-down menu (bits-ui DropdownMenu, restyled as iOS's): rows of 44 px, label left, icon
	// right, destructive in red, a thicker gap before an item with `section`. `trigger` gets the
	// props to spread on your button: {#snippet trigger(props)}<button {...props}>…</button>{/snippet}.
	// Positioned `absolute` against the Screen it portals into: `fixed` lands outside the desktop
	// phone frame, whose transformed body floating-ui does not see as the containing block.
	// Motion (docs/design/motion.md): it grows out of its trigger (the transform origin is where
	// the trigger is) from 0.9, never from nothing, and leaves sooner than it came. Its rows are
	// there with it: no stagger. Reduced motion: it fades.
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
		background: var(--mat-sheet);
		-webkit-backdrop-filter: blur(40px) saturate(180%);
		backdrop-filter: blur(40px) saturate(180%);
		box-shadow: var(--shadow-2);
		transform-origin: var(--bits-dropdown-menu-content-transform-origin);
		animation: ios-menu-in var(--dur-snappy) var(--spring-snappy);
		outline: none;
	}
	:global(.ios-menu[data-state='closed']) {
		animation: ios-menu-out var(--dur-fade) var(--ease-out) forwards;
		pointer-events: none;
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
		background: var(--fill-3);
	}
	@keyframes -global-ios-menu-in {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
	}
	@keyframes -global-ios-menu-out {
		to {
			opacity: 0;
			transform: scale(0.96);
		}
	}
	/* Reduced motion (the setting, not the media query): a fade, both ways. */
	:global(html[data-motion='reduced'] .ios-menu) {
		animation: ios-menu-fade var(--dur-fade) linear !important;
	}
	:global(html[data-motion='reduced'] .ios-menu[data-state='closed']) {
		animation: ios-menu-fade var(--dur-fade) linear reverse forwards !important;
	}
	@keyframes -global-ios-menu-fade {
		from {
			opacity: 0;
		}
	}
</style>
