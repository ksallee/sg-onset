<script lang="ts">
	// An iOS button: filled (tint, the one main action), tinted (tint at 15 %), gray (fill, tint
	// text), plain (text only). Capsules; small 28, medium 34, large 50 tall; every one at least a
	// 44 px target. A link with `href`. Dims on press at once, back in 200 ms.
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		variant = 'gray',
		size = 'medium',
		destructive = false,
		href,
		full = false,
		class: cls = '',
		children,
		...rest
	}: {
		variant?: 'filled' | 'tinted' | 'gray' | 'plain';
		size?: 'small' | 'medium' | 'large';
		destructive?: boolean;
		href?: string;
		/** Full width. */
		full?: boolean;
		class?: string;
		children: Snippet;
	} & Omit<HTMLButtonAttributes, 'children'> = $props();
</script>

{#if href}
	<a {href} class="ios-btn {variant} {size} {cls}" class:red={destructive} class:full aria-label={rest['aria-label']}>{@render children()}</a>
{:else}
	<button type="button" class="ios-btn {variant} {size} {cls}" class:red={destructive} class:full {...rest}>{@render children()}</button>
{/if}

<style>
	.ios-btn {
		--c: var(--tint);
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		flex: none;
		border-radius: 999px;
		color: var(--c);
		white-space: nowrap;
		transition: opacity var(--dur-press);
		-webkit-user-select: none;
		user-select: none;
	}
	.ios-btn.red {
		--c: var(--destructive);
	}
	.ios-btn::after {
		content: '';
		position: absolute;
		inset: min(0px, calc((100% - 44px) / 2)) 0;
	}
	.ios-btn:active:not(:disabled) {
		opacity: 0.55;
		transition: none;
	}
	.ios-btn:disabled {
		opacity: 0.35;
	}
	.ios-btn:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.full {
		display: flex;
		width: 100%;
	}
	.small {
		height: 28px;
		padding: 0 12px;
		font-size: 15px;
		letter-spacing: -0.23px;
		font-weight: 500;
	}
	.medium {
		height: 34px;
		padding: 0 14px;
		font-size: 15px;
		letter-spacing: -0.23px;
		font-weight: 600;
	}
	.large {
		height: 50px;
		padding: 0 20px;
		font-size: 17px;
		letter-spacing: -0.43px;
		font-weight: 600;
	}
	.filled {
		background: var(--tint-solid);
		color: var(--on-tint-solid);
		/* Night fills nothing brightly: a ring edges the dim slab. */
		box-shadow: inset 0 0 0 var(--state-ring) var(--on-tint-solid);
	}
	.filled.red {
		background: var(--destructive-solid);
		color: var(--on-destructive);
		box-shadow: inset 0 0 0 var(--state-ring) var(--on-destructive);
	}
	.tinted {
		background: var(--tint-fill);
	}
	.tinted.red {
		background: var(--rolling-fill);
	}
	.gray {
		background: var(--fill-2);
	}
	.plain {
		background: transparent;
		padding-left: 8px;
		padding-right: 8px;
	}
	.plain.medium,
	.plain.small {
		font-weight: 400;
		font-size: 17px;
		letter-spacing: -0.43px;
	}
</style>
