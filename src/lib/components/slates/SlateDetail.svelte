<script lang="ts">
	// One slate: Shoot This Slate, its takes as a table (selectable for bulk edit), every slate
	// field typed and checked, where it stands against its template, and Duplicate, New Template
	// from Slate and Delete. Everything is read live from the store, so what shows is what is
	// stored, an undo included. A Page of its own: beside the list on an iPad, alone on a phone.
	import { Clapperboard, Ellipsis } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import Menu from '$lib/components/ios/Menu.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { dayName } from '$lib/app/context';
	import { formatDate, formatTime } from '$lib/app/format';
	import { liveList, liveRecord } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { fieldLabel } from '$lib/i18n/modelText';
	import type { Take } from '$lib/model/types';
	import { summarise, takeCount } from '$lib/slates/list';
	import { duplicateSlate, nextSlateName, slateNameTaken } from '$lib/slates/naming';
	import type { Selection } from '$lib/slates/selection';
	import { slateTakeLines } from '$lib/slates/takes';
	import { fieldRefs } from '$lib/slates/fields';
	import { diverged } from '$lib/templates/divergence';
	import { valuesFrom } from '$lib/templates/fields';
	import { copyName } from '$lib/templates/list';
	import FieldRow from './FieldRow.svelte';
	import { useRefs } from './refs.svelte';
	import TakeTable from './TakeTable.svelte';
	import TemplateLink from './TemplateLink.svelte';

	let {
		id,
		takes,
		back = false,
		selection = $bindable(),
		range = $bindable(false),
		onopen
	}: { id: string; takes: Take[]; back?: boolean; selection: Selection; range?: boolean; onopen: (take: Take) => void } = $props();

	const app = useApp();
	const current = useCurrent();
	const refs = useRefs();
	const record = liveRecord('slate', () => id);
	const slate = $derived(record.value);
	const daySlates = liveList('slate', () => slate?.shootDayId);
	const day = $derived(current.shootDays.find((d) => d.id === slate?.shootDayId));
	// No title while the slate loads: beside the list, a fallback "Slates" would be a second one.
	const name = $derived(slate ? t('slates.slate', { slate: slate.slateUID ?? '' }) : record.ready ? t('slates.title') : '');
	const lines = $derived(slateTakeLines(takes, refs.setups, refs.lenses));
	const summary = $derived(slate ? summarise([slate], takes, new Set())[0] : undefined);
	const template = $derived(refs.template(slate?.templateId));
	const changed = $derived(template && slate ? new Set(diverged(template, slate)) : new Set<string>());
	const units = $derived(settings.value.units);
	const FIELDS = fieldRefs('slate');

	const line = $derived.by(() => {
		if (!summary || !day) return '';
		const n = dayName(day);
		const c = takeCount(summary.takes);
		const time = summary.start ? t('slates.time', { start: formatTime(summary.start), end: formatTime(summary.end) }) : '';
		return [t('context.day.line', { day: t(n.key, n.params), date: formatDate(day.shootDate) }), t(c.key, c.params), time].filter(Boolean).join(' · ');
	});

	async function save(key: string, value: unknown) {
		const s = slate;
		if (!s) return;
		const f = FIELDS.find((x) => x.key === key)!;
		await app.edit.set('slate', s, key, value, { key: 'edit.changed', params: { field: fieldLabel(f.def, f.end) } });
	}
	const taken = (value: unknown) => (slate && typeof value === 'string' && slateNameTaken(daySlates.value, value, slate.id) ? t('slates.new.taken') : undefined);

	async function shoot() {
		const s = slate;
		if (!s) return;
		current.select({ shootDayId: s.shootDayId, slateId: s.id });
		await goto('/shoot');
	}
	async function duplicate() {
		const s = slate;
		if (!s) return;
		const copy = duplicateSlate(s, app.newId(), nextSlateName(daySlates.value, s.sceneNumber));
		await app.edit.create('slate', copy, { label: { key: 'slates.duplicated', params: { slate: s.slateUID ?? '' } } });
		await goto(`/slates/${copy.id}`);
	}
	async function saveTemplate() {
		const s = slate;
		const projectId = current.project?.id;
		if (!s || !projectId) return;
		const tp = { id: app.newId(), projectId, scope: 'slate' as const, name: copyName(t('slates.slate', { slate: s.slateUID ?? '' }), refs.templates.map((x) => x.name), true), values: valuesFrom('slate', s) };
		await app.edit.create('template', tp, { label: { key: 'templates.created', params: { name: tp.name } } });
		await goto(`/templates/${tp.id}`);
	}
	async function remove() {
		const s = slate;
		if (!s) return;
		await app.edit.removeTree('slate', s.id, { key: 'edit.removed', params: { what: t('slates.slate', { slate: s.slateUID ?? '' }) } });
		await goto('/slates');
	}
	const menu = $derived([
		{ label: t('slates.detail.duplicate'), run: duplicate },
		{ label: t('slates.detail.saveTemplate'), run: saveTemplate },
		{ label: t('slates.detail.delete'), destructive: true, section: true, run: remove }
	]);
</script>

<Page>
	<NavBar title={name} large back={back ? { href: '/slates', label: t('slates.title') } : undefined}>
		{#snippet trailing()}
			{#if slate}
				<Menu items={menu}>
					{#snippet trigger(props)}<button {...props} class="more" aria-label={t('slates.detail.more')}><Ellipsis class="size-[22px]" strokeWidth={2.2} /></button>{/snippet}
				</Menu>
			{/if}
		{/snippet}
	</NavBar>
	{#if slate}
		{#if line}<p class="line">{line}</p>{/if}
		<div class="actions"><Button variant="filled" size="large" full onclick={shoot}>{t('slates.detail.shoot')}</Button></div>

		{#if lines.length}
			<div class="table">
				<h2 class="section-header head">{t('slates.detail.takes')}</h2>
				<TakeTable {lines} bind:selection bind:range {onopen} label={t('slates.detail.takes')} />
				<p class="hint">{t('slates.select.hint')}</p>
			</div>
		{:else}
			<Section header={t('slates.detail.takes')}>
				<Row title={t('slates.detail.takes.none')} class="quiet" />
			</Section>
		{/if}

		<TemplateLink table="slate" record={slate} what={name} />

		<Section header={t('slates.detail.header')}>
			{#each FIELDS as f (f.key)}
				<FieldRow
					scope="slate"
					field={f}
					value={(slate as Record<string, unknown>)[f.key]}
					{units}
					options={refs.options(f.key)}
					marker={changed.has(f.key)}
					check={f.key === 'slateUID' ? taken : undefined}
					onsave={(v) => save(f.key, v)}
				/>
			{/each}
		</Section>

		<Section footer={t('slates.detail.footer')}>
			<Row title={t('slates.detail.delete')} destructive onclick={remove} />
		</Section>
		<div class="room" aria-hidden="true"></div>
	{:else if record.ready}
		<EmptyState icon={Clapperboard} title={t('slates.missing')} message={t('slates.missing.message')}>
			{#snippet action()}<Button variant="filled" href="/slates">{t('slates.title')}</Button>{/snippet}
		</EmptyState>
	{/if}
</Page>

<style>
	.line {
		padding: 0 calc(var(--page-margin, 16px) + var(--title-inset, 0px));
		margin-block: -6px 16px;
		font-size: 15px;
		line-height: 20px;
		color: var(--label-2);
		font-variant-numeric: tabular-nums;
	}
	.actions {
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 24px;
	}
	.table {
		margin-block: 0 32px;
	}
	.head {
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		margin-bottom: 7px;
	}
	.hint {
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		margin-top: 7px;
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
	.room {
		height: var(--select-space, 0px);
	}
	.more {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--tint);
	}
</style>
