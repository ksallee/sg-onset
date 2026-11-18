<script lang="ts">
	// Circled, No good and the note of the take on screen, under the thumb. The two marks are
	// toggles: on reads by its filled face and its tick, not by colour alone. The note opens a
	// sheet; beside the rail it shows the note on as many lines as it has, up to ten. In a
	// phone-width window the three share one row and the note is one line.
	import { Ban, CircleCheck, NotebookPen } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';
	import type { Shoot } from '$lib/take/shoot.svelte';

	let { shoot, onnote, compact = false }: { shoot: Shoot; onnote: () => void; compact?: boolean } = $props();
	const off = $derived(!shoot.group);
</script>

<div class="marks" class:compact role="group" aria-label={t('marks.label')}>
	<button type="button" class="mark" aria-pressed={shoot.circled} disabled={off} onclick={() => shoot.toggleMark('circleTake')}>
		<CircleCheck class="size-6" strokeWidth={2.2} /><span>{t('marks.circle')}</span>
	</button>
	<button type="button" class="mark" aria-pressed={shoot.noGood} disabled={off} onclick={() => shoot.toggleMark('noGood')}>
		<Ban class="size-6" strokeWidth={2.2} /><span>{t('marks.noGood')}</span>
	</button>
	<button type="button" class="note" class:has={!!shoot.note} disabled={off} aria-label={shoot.note ? `${t('marks.note')}: ${shoot.note}` : t('marks.note.add')} onclick={onnote}>
		<span class="icon"><NotebookPen class="size-6" strokeWidth={2} /></span>
		<span class="text">{shoot.note || (compact ? t('marks.note') : t('marks.note.add'))}</span>
	</button>
</div>

<style>
	.marks {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.marks.compact {
		grid-template-columns: auto auto minmax(0, 1fr);
	}
	button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: max(var(--touch, 44px), 52px);
		padding: 0 12px;
		border-radius: 14px;
		background: var(--fill-2);
		color: var(--label);
		font-size: 16px;
		font-weight: 600;
		white-space: nowrap;
	}
	.compact button {
		min-height: var(--touch, 44px);
		font-size: 15px;
	}
	.mark[aria-pressed='true'] {
		background: var(--tint-solid);
		color: var(--on-tint-solid);
		box-shadow: inset 0 0 0 var(--state-ring) var(--on-tint-solid);
	}
	.note {
		grid-column: 1 / -1;
		justify-content: flex-start;
		align-items: flex-start;
		min-width: 0;
		padding: 14px 14px;
		text-align: left;
	}
	.icon {
		flex: none;
		display: flex;
		margin-top: -1px;
	}
	/* Beside the rail: the note on its lines, as typed. */
	.note .text {
		min-width: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 16px;
		line-height: 22px;
		display: -webkit-box;
		-webkit-line-clamp: 10;
		line-clamp: 10;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.compact .note {
		grid-column: auto;
		align-items: center;
		padding: 0 12px;
	}
	.compact .note .text {
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 15px;
	}
	.note:not(.has) .text {
		color: var(--tint);
	}
	button:active:not(:disabled) {
		background: var(--press);
	}
	button:disabled {
		opacity: 0.4;
	}
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
</style>
