<script lang="ts">
	// The take template of the take on screen: pick one and it fills every camera of the take and
	// links them. Linked: which fields were changed since, Reset and Unlink. The next take copies
	// the last, so it keeps the template. Every action is one undo.
	import { LayoutTemplate } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import { keyLabel } from '$lib/components/slates/values';
	import { t } from '$lib/i18n/messages';
	import type { Shoot } from '$lib/take/shoot.svelte';

	let { shoot }: { shoot: Shoot } = $props();

	const link = $derived(shoot.link);
	const template = $derived(shoot.template);
	const changed = $derived(shoot.templateChanged);
	const choices = $derived(shoot.takeTemplates);
	const labels = $derived(changed.map((key) => keyLabel('take', key)).join(', '));
	const resetLabel = $derived(changed.length === 1 ? t('slates.link.reset.one') : t('slates.link.reset.many', { n: changed.length }));
	const footer = $derived(
		link.kind === 'none'
			? choices.length
				? t('take.template.footer')
				: t('take.template.none.footer')
			: link.kind === 'mixed'
				? t('take.template.mixed.footer')
				: !template
					? t('slates.link.unlink.footer')
					: changed.length
						? t('slates.link.diverged', { fields: labels })
						: t('slates.link.same')
	);
</script>

<Section header={t('slates.link.header')} {footer}>
	{#if link.kind === 'one' && template}
		<Row title={template.name} subtitle={t('slates.link.from')} href="/templates/{template.id}">
			{#snippet leading()}<Tile icon={LayoutTemplate} color="var(--tint)" />{/snippet}
		</Row>
		{#if changed.length}<Row title={resetLabel} class="tint" onclick={() => shoot.resetTemplate()} />{/if}
		<Row title={t('slates.link.unlink')} class="tint" onclick={() => shoot.unlinkTemplate()} />
	{:else if link.kind === 'one'}
		<Row title={t('slates.link.missing')} class="quiet" />
		<Row title={t('slates.link.unlink')} class="tint" onclick={() => shoot.unlinkTemplate()} />
	{:else}
		<div class="pick" role="listitem">
			<label class="cell">
				<span class="label">{t('slates.link.use')}</span>
				<select
					value=""
					onchange={(e) => {
						shoot.linkTemplate(e.currentTarget.value);
						e.currentTarget.value = '';
					}}
					disabled={choices.length === 0}
				>
					<option value="">{t('slates.link.none')}</option>
					{#each choices as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				</select>
			</label>
		</div>
		{#if link.kind === 'mixed'}<Row title={t('slates.link.unlink')} class="tint" onclick={() => shoot.unlinkTemplate()} />{/if}
		{#if choices.length === 0}<Row title={t('take.template.manage')} class="tint" href="/templates" />{/if}
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
