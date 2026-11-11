<script lang="ts">
	// One setting in a Section: its name, a line on what it does, and its control. Stacked, the
	// control spans the row under the name, so it is in reach of either thumb. `inline` puts a
	// small control (a switch) beside the name, on the side of the holding hand.
	import type { Snippet } from 'svelte';

	let { title, hint, inline = false, aside, children }: { title: string; hint?: string; inline?: boolean; aside?: Snippet; children: Snippet } = $props();
</script>

<div class="setting" class:inline role="listitem">
	<div class="head">
		<div class="text">
			<span class="title">{title}</span>
			{#if hint}<span class="hint">{hint}</span>{/if}
		</div>
		{#if aside}<div class="aside">{@render aside()}</div>{/if}
	</div>
	<div class="control">{@render children()}</div>
</div>

<style>
	.setting {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 16px 14px;
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.setting:last-child {
		box-shadow: none;
	}
	.setting.inline {
		flex-direction: row;
		align-items: center;
		gap: 12px;
		padding-top: 10px;
		padding-bottom: 10px;
	}
	/* The switch sits under the thumb of the holding hand. */
	:global(html[data-hand='left']) .setting.inline {
		flex-direction: row-reverse;
	}
	.head {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.title {
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	.hint {
		font-size: 13px;
		line-height: 18px;
		letter-spacing: -0.08px;
		color: var(--label-2);
	}
	.aside {
		flex: none;
	}
	.inline .control {
		flex: none;
		display: flex;
		align-items: center;
	}
</style>
