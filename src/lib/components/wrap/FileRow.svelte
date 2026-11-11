<script lang="ts">
	// One file of the package: a switch to put it in, who it is for, the honest notes about it, and
	// a menu to preview it or share it on its own. Sits in a Section.
	import { Ellipsis } from '@lucide/svelte';
	import Menu from '$lib/components/ios/Menu.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import { t } from '$lib/i18n/messages';

	type Action = { label: string; run: () => void; disabled?: boolean };
	let {
		title,
		about,
		notes = [],
		detail,
		on,
		ontoggle,
		actions = []
	}: { title: string; about: string; notes?: { text: string; quiet?: boolean }[]; detail?: string; on: boolean; ontoggle: (on: boolean) => void; actions?: Action[] } = $props();
</script>

<div class="file" role="listitem" class:off={!on}>
	<div class="text">
		<div class="title">{title}{#if detail}<span class="detail">{detail}</span>{/if}</div>
		<div class="about">{about}</div>
		{#if on}
			{#each notes as note (note.text)}<div class="note" class:quiet={note.quiet}>{note.text}</div>{/each}
		{/if}
	</div>
	{#if actions.length}
		<Menu items={actions}>
			{#snippet trigger(props)}
				<button {...props} type="button" class="more" aria-label={t('wrap.file.more', { file: title })}><Ellipsis class="size-[20px]" strokeWidth={2.2} aria-hidden="true" /></button>
			{/snippet}
		</Menu>
	{/if}
	<Toggle checked={on} onchange={ontoggle} label={title} />
</div>

<style>
	.file {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		min-height: var(--touch, 44px);
		position: relative;
	}
	.file + :global(.file)::before,
	.file:not(:first-child)::before {
		content: '';
		position: absolute;
		top: 0;
		left: 16px;
		right: 0;
		height: var(--hairline);
		background: var(--separator);
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.title {
		font-size: 17px;
		line-height: 22px;
		color: var(--label);
		display: flex;
		gap: 8px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.detail {
		font-size: 15px;
		color: var(--label-2);
		font-variant-numeric: tabular-nums;
	}
	.about {
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
		margin-top: 1px;
	}
	.note {
		font-size: 13px;
		line-height: 18px;
		color: var(--warning);
		margin-top: 4px;
	}
	.note.quiet {
		color: var(--label-2);
	}
	.off .title {
		color: var(--label-2);
	}
	.more {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--touch, 44px);
		height: var(--touch, 44px);
		border-radius: 999px;
		color: var(--tint);
		background: transparent;
	}
	.more:active {
		background: var(--press);
	}
</style>
