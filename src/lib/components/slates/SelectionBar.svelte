<script lang="ts">
	// The bar of a selection, while takes are selected: how many, select all in view or none,
	// Range, Done, and Edit. It floats over the foot of the page on the holding hand's side, raised
	// clear of the shell's notice (so an Undo after an edit stays in sight), Edit nearest the thumb.
	// Put it in the Page's `accessory`. It slides up on transform and opacity; reduced motion
	// shows it at once.
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Button from '$lib/components/ios/Button.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';

	let {
		count,
		all,
		range = $bindable(false),
		onall,
		onnone,
		onedit,
		ondone
	}: { count: number; all: boolean; range?: boolean; onall: () => void; onnone: () => void; onedit: () => void; ondone: () => void } = $props();

	const text = $derived(range ? t('slates.select.range.on') : count === 1 ? t('slates.select.count.one') : t('slates.select.count.many', { n: count }));
</script>

<div class="anchor">
	{#if count > 0}
		<div class="bar" data-hand={settings.value.hand} role="toolbar" aria-label={text} transition:fly={{ y: 24, duration: 260, easing: cubicOut }}>
			<span class="count" aria-live="polite">{text}</span>
			<div class="actions">
				<Button variant="plain" onclick={() => (all ? onnone() : onall())}>{all ? t('slates.select.none') : t('slates.select.all')}</Button>
				<Button variant={range ? 'tinted' : 'plain'} aria-pressed={range} onclick={() => (range = !range)}>{t('slates.select.range')}</Button>
				<Button variant="plain" onclick={ondone}>{t('slates.select.done')}</Button>
				<Button variant="filled" onclick={onedit}>{t('slates.select.edit')}</Button>
			</div>
		</div>
	{/if}
</div>

<style>
	.anchor {
		position: relative;
		height: 0;
	}
	.bar {
		position: absolute;
		bottom: calc(84px + var(--safe-bottom));
		right: var(--page-margin, 16px);
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: calc(100% - 2 * var(--page-margin, 16px));
		padding: 6px 6px 6px 18px;
		border-radius: 26px;
		background: var(--cell-elevated);
		box-shadow:
			0 0 0 var(--hairline) var(--separator),
			0 10px 30px rgb(0 0 0 / 0.22);
	}
	.bar[data-hand='left'] {
		right: auto;
		left: var(--page-margin, 16px);
		flex-direction: row-reverse;
		padding: 6px 18px 6px 6px;
	}
	.bar[data-hand='left'] .actions {
		flex-direction: row-reverse;
	}
	.count {
		flex: none;
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
		color: var(--label);
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	@media (max-width: 560px) {
		.bar {
			left: 12px;
			right: 12px;
			max-width: none;
			flex-wrap: wrap;
			justify-content: space-between;
			border-radius: 22px;
			padding: 8px 8px 8px 16px;
		}
		.actions {
			flex: 1 0 100%;
			justify-content: flex-end;
		}
		.bar[data-hand='left'] .actions {
			justify-content: flex-start;
		}
		.bar[data-hand='left'] {
			left: 12px;
			right: 12px;
			padding: 8px 16px 8px 8px;
		}
	}
</style>
