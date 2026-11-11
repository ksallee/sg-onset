<script lang="ts">
	// Where a slate or a take stands against its template: which one it came from, which fields
	// were changed here since, and the two ways out: reset them to the template, or unlink. With
	// no template, a picker links one (and fills its fields). Every action is one undo.
	import { LayoutTemplate } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { t } from '$lib/i18n/messages';
	import type { Slate, Take } from '$lib/model/types';
	import { linkPreview } from '$lib/slates/bulk';
	import { diverged, reapplyPatch, unlinkPatch } from '$lib/templates/divergence';
	import { useRefs } from './refs.svelte';
	import { keyLabel } from './values';

	let { table, record, what }: { table: 'slate' | 'take'; record: Slate | Take; what: string } = $props();

	const app = useApp();
	const refs = useRefs();
	const template = $derived(refs.template(record.templateId));
	const changed = $derived(template ? diverged(template, record) : []);
	const choices = $derived(refs.templates.filter((tp) => tp.scope === table));
	const labels = $derived(changed.map((key) => keyLabel(table, key)).join(', '));

	async function reset() {
		if (!template) return;
		await app.edit.apply(table, reapplyPatch(template, record), { key: 'slates.link.reset.done', params: { what, template: template.name } });
	}
	async function unlink() {
		await app.edit.apply(table, unlinkPatch(record), { key: 'slates.link.unlinked', params: { what } });
	}
	async function link(id: string) {
		const tp = refs.template(id);
		if (!tp) return;
		await app.edit.apply(table, linkPreview([record], [record.id], tp).patch, { key: 'slates.link.linked', params: { what, template: tp.name } });
	}
	const resetLabel = $derived(changed.length === 1 ? t('slates.link.reset.one') : t('slates.link.reset.many', { n: changed.length }));
	const footer = $derived(!record.templateId ? t('slates.link.none.footer') : !template ? t('slates.link.unlink.footer') : changed.length ? t('slates.link.diverged', { fields: labels }) : t('slates.link.same'));
</script>

<Section header={t('slates.link.header')} {footer}>
	{#if record.templateId && template}
		<Row title={template.name} subtitle={t('slates.link.from')} href="/templates/{template.id}">
			{#snippet leading()}<Tile icon={LayoutTemplate} color="var(--tint)" />{/snippet}
		</Row>
		{#if changed.length}<Row title={resetLabel} class="tint" onclick={reset} />{/if}
		<Row title={t('slates.link.unlink')} class="tint" onclick={unlink} />
	{:else if record.templateId}
		<Row title={t('slates.link.missing')} class="quiet" />
		<Row title={t('slates.link.unlink')} class="tint" onclick={unlink} />
	{:else}
		<div class="pick" role="listitem">
			<label class="cell">
				<span class="label">{t('slates.link.use')}</span>
				<select value="" onchange={(e) => link(e.currentTarget.value)} disabled={choices.length === 0}>
					<option value="">{t('slates.link.none')}</option>
					{#each choices as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				</select>
			</label>
		</div>
	{/if}
</Section>

<style>
	.pick {
		background: var(--group-bg, var(--cell));
	}
	.cell {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: var(--touch, 44px);
		padding: 0 16px;
	}
	.label {
		flex: none;
		font-size: 17px;
		color: var(--label);
	}
	select {
		flex: 1;
		min-width: 0;
		min-height: var(--touch, 44px);
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		color: var(--tint);
		text-align: right;
		text-align-last: right;
		font-size: 17px;
		outline: none;
	}
	select:disabled {
		color: var(--label-3);
	}
</style>
