<script lang="ts">
	// The project's templates: slate templates and take templates, each with how many fields it
	// sets and how many entries follow it. New, swipe to delete (with Undo).
	import { LayoutTemplate, Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import Menu from '$lib/components/ios/Menu.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { t } from '$lib/i18n/messages';
	import type { TemplateRecord, TemplateScope } from '$lib/model/template';
	import { linkCounts, sortTemplates } from '$lib/templates/list';
	import { deleteTemplate, newTemplate } from './actions';

	const app = useApp();
	const current = useCurrent();
	const rows = liveList('template', () => current.project?.id);
	const slates = liveList('slate');
	const takes = liveList('take');
	const templates = $derived(sortTemplates(rows.value));
	const counts = $derived(linkCounts([...slates.value, ...takes.value]));

	async function make(scope: TemplateScope) {
		const projectId = current.project?.id;
		if (!projectId) return;
		const tp = await newTemplate(app, projectId, scope, templates.map((x) => x.name));
		await goto(`/templates/${tp.id}`);
	}
	const items = [
		{ label: t('templates.new.slate'), run: () => make('slate') },
		{ label: t('templates.new.take'), run: () => make('take') }
	];
	const fields = (tp: TemplateRecord) => {
		const n = Object.keys(tp.values).length;
		return n === 0 ? t('templates.fields.none') : n === 1 ? t('templates.fields.one') : t('templates.fields.many', { n });
	};
	const linked = (tp: TemplateRecord) => {
		const n = counts.get(tp.id) ?? 0;
		if (n === 0) return t('templates.linked.none');
		if (tp.scope === 'slate') return n === 1 ? t('templates.linked.slate.one') : t('templates.linked.slate.many', { n });
		return n === 1 ? t('templates.linked.take.one') : t('templates.linked.take.many', { n });
	};
	const remove = (tp: TemplateRecord) => deleteTemplate(app, tp, tp.scope === 'slate' ? slates.value : takes.value);
</script>

<Page>
	<NavBar title={t('templates.title')} large>
		{#snippet trailing()}
			<Menu {items}>
				{#snippet trigger(props)}<button {...props} class="new"><Plus class="size-[20px]" strokeWidth={2.2} />{t('templates.new')}</button>{/snippet}
			</Menu>
		{/snippet}
	</NavBar>
	<ContextBar day={false} />
	{#if rows.ready && templates.length === 0}
		<EmptyState icon={LayoutTemplate} title={t('templates.empty')} message={t('templates.empty.message')}>
			{#snippet action()}
				<div class="both">
					<Button variant="filled" onclick={() => make('slate')}>{t('templates.new.slate')}</Button>
					<Button variant="gray" onclick={() => make('take')}>{t('templates.new.take')}</Button>
				</div>
			{/snippet}
		</EmptyState>
	{:else if rows.ready}
		{#each ['slate', 'take'] as const as scope (scope)}
			{@const list = templates.filter((tp) => tp.scope === scope)}
			<Section header={t(`templates.${scope}`)} footer={t(`templates.${scope}.footer`)}>
				{#each list as tp (tp.id)}
					<Row title={tp.name} subtitle={fields(tp)} detail={linked(tp)} href="/templates/{tp.id}" swipe={[{ label: t('common.delete'), destructive: true, run: () => remove(tp) }]} />
				{:else}
					<Row title={scope === 'slate' ? t('templates.new.slate') : t('templates.new.take')} class="tint" onclick={() => make(scope)} />
				{/each}
			</Section>
		{/each}
	{/if}
</Page>

<style>
	.new {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 44px;
		padding: 0 8px;
		font-size: 17px;
		color: var(--tint);
	}
	.both {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
	}
</style>
