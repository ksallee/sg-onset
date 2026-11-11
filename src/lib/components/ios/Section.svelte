<script lang="ts">
	// A grouped list section: header above (footnote, uppercase), rows in a rounded group, footer
	// below. `inset = false`: edge to edge, hairlines top and bottom. Inside a Sheet the group takes
	// the elevated cell colour.
	import type { Snippet } from 'svelte';

	let {
		header,
		footer,
		inset = true,
		children,
		class: cls = ''
	}: { header?: string | Snippet; footer?: string | Snippet; inset?: boolean; children: Snippet; class?: string } = $props();
</script>

<section class="ios-section {cls}" class:inset>
	{#if header}
		<h2 class="head section-header">{#if typeof header === 'string'}{header}{:else}{@render header()}{/if}</h2>
	{/if}
	<div class="group" role="list">
		{@render children()}
	</div>
	{#if footer}
		<div class="foot">{#if typeof footer === 'string'}{footer}{:else}{@render footer()}{/if}</div>
	{/if}
</section>

<style>
	.ios-section {
		flex: none;
		margin-bottom: 32px;
	}
	.head {
		padding: 0 calc(var(--page-margin, 16px) + 16px) 6px;
		font-weight: 400;
	}
	.ios-section:not(.inset) .head {
		padding-left: 16px;
	}
	.group {
		background: var(--group-bg, var(--cell));
		overflow: hidden;
		/* Increase Contrast outlines the group (--cell-ring, 0 otherwise). An outline: the rows paint over an inset shadow. */
		outline: var(--cell-ring) solid var(--separator-opaque);
	}
	.inset .group {
		margin: 0 var(--page-margin, 16px);
		border-radius: 24px;
	}
	.ios-section:not(.inset) .group {
		box-shadow: 0 calc(-1 * var(--hairline)) 0 var(--separator), 0 var(--hairline) 0 var(--separator);
	}
	.foot {
		padding: 6px calc(var(--page-margin, 16px) + 16px) 0;
		font-size: 13px;
		line-height: 18px;
		letter-spacing: -0.08px;
		color: var(--label-2);
	}
	.ios-section:not(.inset) .foot {
		padding-left: 16px;
	}
</style>
