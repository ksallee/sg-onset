<script lang="ts">
	// The review before a template edit is saved: how many linked entries change, the choice of
	// how far the edit reaches, and every change listed per field and per entry, with the hand
	// changes marked and, under the first choice, kept. Save applies the template and the entries
	// as one undo (the caller does it, with the mode picked here).
	import Button from '$lib/components/ios/Button.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import type { TemplateEditMode, TemplateScope } from '$lib/model/template';
	import type { TemplateReview } from '$lib/templates/review';
	import { keyLabel, keyValueText, type Names } from '$lib/components/slates/values';

	let {
		open = $bindable(false),
		review,
		scope,
		entryName,
		names,
		onsave
	}: { open?: boolean; review: TemplateReview; scope: TemplateScope; entryName: (id: string) => string; names: Names; onsave: (mode: TemplateEditMode) => Promise<void> } = $props();

	let mode = $state<TemplateEditMode>('untouched');
	let saving = $state(false);
	$effect(() => {
		if (open) mode = 'untouched';
	});
	const units = $derived(settings.value.units);
	const fields = (n: number) => (n === 1 ? t('templates.review.fields.one') : t('templates.review.fields.many', { n }));
	const entries = (n: number) => (scope === 'slate' ? (n === 1 ? t('templates.review.entries.slate.one') : t('templates.review.entries.slate.many', { n })) : n === 1 ? t('templates.review.entries.take.one') : t('templates.review.entries.take.many', { n }));
	const lead = $derived.by(() => {
		const n = review.all.records;
		if (scope === 'slate') return n === 1 ? t('templates.review.lead.slate.one') : t('templates.review.lead.slate.many', { n });
		return n === 1 ? t('templates.review.lead.take.one') : t('templates.review.lead.take.many', { n });
	});
	const text = (key: string, value: unknown) => keyValueText(scope, key, value, units, names) || '—';
	const toOf = $derived(new Map(review.records.flatMap((r) => r.fields.map((f) => [f.key, f.to] as const))));

	async function save() {
		saving = true;
		try {
			await onsave(review.choice ? mode : 'all');
			open = false;
		} finally {
			saving = false;
		}
	}
</script>

<Sheet bind:open title={t('templates.review.title')}>
	{#snippet leading()}<Button variant="plain" onclick={() => (open = false)}>{t('common.cancel')}</Button>{/snippet}
	<p class="lead">{lead}</p>
	{#if review.choice}
		<Section header={t('templates.review.choose')}>
			<div class="choices" role="radiogroup" aria-label={t('templates.review.choose')}>
				{#each ['untouched', 'all'] as const as m (m)}
					<button type="button" role="radio" aria-checked={mode === m} class="choice" class:on={mode === m} onclick={() => (mode = m)}>
						<span class="radio" aria-hidden="true"></span>
						<span class="body">
							<span class="title">{m === 'untouched' ? t('templates.review.untouched') : t('templates.review.all')}</span>
							<span class="detail">
								{m === 'untouched'
									? t('templates.review.untouched.detail', { fields: fields(review.untouched.fields), entries: entries(review.untouched.records), kept: fields(review.kept.fields) })
									: t('templates.review.all.detail', { fields: fields(review.all.fields), entries: entries(review.all.records), kept: fields(review.kept.fields) })}
							</span>
						</span>
					</button>
				{/each}
			</div>
		</Section>
	{:else}
		<p class="lead quiet">{t('templates.review.plain', { fields: fields(review.all.fields), entries: entries(review.all.records) })}</p>
	{/if}

	<Section header={t('templates.review.changes')}>
		{#each review.byField as f (f.key)}
			<Row title={keyLabel(scope, f.key)} subtitle={t('templates.review.field.counts', { untouched: f.untouched, touched: f.touched })} detail={text(f.key, toOf.get(f.key))} />
		{/each}
	</Section>

	{#each review.records as r (r.id)}
		<Section header={entryName(r.id)}>
			{#each r.fields as f (f.key)}
				{@const stays = f.touched && mode === 'untouched' && review.choice}
				<div class="change" class:stays role="listitem">
					<span class="key">{keyLabel(scope, f.key)}</span>
					<span class="values">
						<span class="from">{text(f.key, f.from)}</span>
						<span class="arrow" aria-hidden="true">→</span>
						<span class="to">{stays ? t('templates.review.stays') : text(f.key, f.to)}</span>
					</span>
					{#if f.touched}<span class="hand">{t('templates.review.byHand')}</span>{/if}
				</div>
			{/each}
		</Section>
	{/each}

	<div class="save">
		<Button variant="filled" size="large" full disabled={saving} onclick={save}>{t('templates.review.save')}</Button>
		<p>{t('templates.review.footer')}</p>
	</div>
</Sheet>

<style>
	.lead {
		padding: 8px calc(var(--page-margin, 16px) + 16px) 0;
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		color: var(--label);
	}
	.lead.quiet {
		font-weight: 400;
		color: var(--label-2);
		padding-top: 4px;
		margin-bottom: 8px;
	}
	.choices {
		display: flex;
		flex-direction: column;
	}
	.choice {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 14px 16px;
		text-align: left;
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		transition: background-color var(--dur-press);
	}
	.choice:last-child {
		box-shadow: none;
	}
	.choice:active {
		background: var(--fill-3);
		transition: none;
	}
	.radio {
		flex: none;
		width: 24px;
		height: 24px;
		margin-top: 1px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1.5px var(--label-3);
		transition: box-shadow var(--dur-control) var(--ease-ios);
	}
	.choice.on .radio {
		box-shadow: inset 0 0 0 7px var(--tint);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.title {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		color: var(--label);
	}
	.detail {
		font-size: 15px;
		line-height: 20px;
		color: var(--label-2);
	}
	.change {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 12px;
		min-height: 44px;
		padding: 8px 16px;
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		font-size: 16px;
	}
	.change:last-child {
		box-shadow: none;
	}
	.key {
		flex: 1;
		min-width: 120px;
		color: var(--label);
	}
	.values {
		display: inline-flex;
		gap: 8px;
		font-variant-numeric: tabular-nums;
	}
	.from {
		color: var(--label-2);
	}
	.arrow {
		color: var(--label-3);
	}
	.to {
		font-weight: 600;
		color: var(--tint);
	}
	.stays .to {
		color: var(--label-2);
		font-weight: 400;
	}
	.hand {
		padding: 1px 8px;
		border-radius: 9px;
		font-size: 12px;
		line-height: 18px;
		font-weight: 600;
		color: var(--changed);
		box-shadow: inset 0 0 0 1.5px var(--changed);
	}
	.save {
		padding: 8px var(--page-margin, 16px) 24px;
	}
	.save p {
		margin-top: 8px;
		padding: 0 16px;
		font-size: 13px;
		color: var(--label-2);
		text-align: center;
	}
</style>
