<script lang="ts">
	// The drawing's tools: what a press does, the ink, then Undo, Redo and Delete. One column on the
	// holding hand's edge, or rows along the foot (DrawCover places it). Every control is a 44 px
	// target or more; the tool and the ink picked say so with a ring, not colour alone.
	import { Redo2, Trash2, Undo2 } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import { INK_NAMES, INKS, type Ink } from '$lib/draw/drawing';
	import type { Tool } from '$lib/draw/gesture';
	import { t } from '$lib/i18n/messages';

	let {
		tools,
		tool = $bindable(),
		ink = $bindable(),
		canUndo,
		canRedo,
		canDelete,
		onundo,
		onredo,
		ondelete
	}: {
		tools: { id: Tool; label: string; icon: Component }[];
		tool: Tool;
		ink: Ink;
		canUndo: boolean;
		canRedo: boolean;
		canDelete: boolean;
		onundo: () => void;
		onredo: () => void;
		ondelete: () => void;
	} = $props();
</script>

<div class="group" role="radiogroup" aria-label={t('draw.tools')}>
	{#each tools as item (item.id)}
		{@const Icon = item.icon}
		<button type="button" class="tool" role="radio" aria-checked={tool === item.id} onclick={() => (tool = item.id)}>
			<Icon class="size-[22px]" strokeWidth={2} aria-hidden="true" />
			<span>{item.label}</span>
		</button>
	{/each}
</div>
<div class="group inks" role="radiogroup" aria-label={t('draw.inks')}>
	{#each INK_NAMES as name (name)}
		<button type="button" class="ink" role="radio" aria-checked={ink === name} aria-label={t(`draw.ink.${name}`)} onclick={() => (ink = name)}>
			<span style:background={INKS[name]}></span>
		</button>
	{/each}
</div>
<div class="group">
	<button type="button" class="act" disabled={!canUndo} aria-label={t('draw.undo')} onclick={onundo}><Undo2 class="size-[22px]" strokeWidth={2} /></button>
	<button type="button" class="act" disabled={!canRedo} aria-label={t('draw.redo')} onclick={onredo}><Redo2 class="size-[22px]" strokeWidth={2} /></button>
	<button type="button" class="act" disabled={!canDelete} aria-label={t('draw.delete')} onclick={ondelete}><Trash2 class="size-[22px]" strokeWidth={2} /></button>
</div>

<style>
	.group {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.group + .group {
		padding-top: 8px;
		margin-top: 4px;
		border-top: 0.5px solid var(--separator);
	}
	.tool {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		width: 68px;
		min-height: 48px;
		border-radius: 12px;
		color: var(--label);
		font-size: 11px;
		line-height: 13px;
		font-weight: 600;
	}
	.tool[aria-checked='true'] {
		background: var(--tint-fill);
		color: var(--tint);
		box-shadow: inset 0 0 0 2px var(--state-ring);
	}
	.inks {
		display: grid;
		grid-template-columns: repeat(2, 34px);
		gap: 2px 8px;
	}
	.ink {
		display: grid;
		place-items: center;
		width: 34px;
		height: 44px;
	}
	.ink span {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		box-shadow: 0 0 0 1px var(--separator-opaque);
	}
	/* Red night mode: an ink must not light the set either. */
	:global([data-night='true']) .ink span {
		filter: grayscale(1) brightness(0.6);
	}
	.ink[aria-checked='true'] span {
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 4px var(--state-ring);
	}
	.act {
		display: grid;
		place-items: center;
		width: 52px;
		height: 44px;
		border-radius: 12px;
		color: var(--tint);
	}
	.act:disabled {
		color: var(--tint-disabled);
	}
	.tool:active,
	.act:not(:disabled):active {
		background: var(--press);
	}
	@media (max-width: 699px) {
		.group,
		.group + .group {
			flex-direction: row;
			flex-wrap: wrap;
			justify-content: center;
			padding-top: 0;
			margin-top: 0;
			border-top: 0;
		}
		.inks {
			display: flex;
		}
		.tool {
			width: 60px;
			min-height: 48px;
		}
		.act {
			width: 44px;
		}
	}
</style>
