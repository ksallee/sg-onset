<script lang="ts">
	// One slate: its name, scene and description, typed straight into the store, and its takes.
	// The rest of the fields, templates and bulk edit come with the slates work (docs/areas.md).
	import { Clapperboard } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { readField } from '$lib/app/fieldEdit';
	import { formatTime } from '$lib/app/format';
	import { liveList, liveRecord } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import { fieldLabel, issueText } from '$lib/i18n/modelText';
	import { takeRows } from '$lib/app/takeRows';

	const KEYS = ['slateUID', 'sceneNumber', 'description'] as const;
	type Key = (typeof KEYS)[number];

	const app = useApp();
	const current = useCurrent();
	const id = $derived(page.params.id);
	const slate = liveRecord('slate', () => id);
	const takes = liveList('take', () => id);
	const setups = liveList('cameraSetup', () => current.project?.id);
	const lenses = liveList('lens', () => current.project?.id);
	const rows = $derived(takeRows(takes.value, setups.value, lenses.value));
	const title = $derived(slate.value ? t('slates.slate', { slate: slate.value.slateUID ?? '' }) : t('slates.title'));

	// What is typed, by field; it follows the store (an undo shows at once).
	let text = $state<Record<Key, string>>({ slateUID: '', sceneNumber: '', description: '' });
	let errors = $state<Partial<Record<Key, string>>>({});
	$effect(() => {
		const s = slate.value;
		text = { slateUID: s?.slateUID ?? '', sceneNumber: s?.sceneNumber ?? '', description: s?.description ?? '' };
	});

	async function save(key: Key, typed: string) {
		const record = slate.value;
		if (!record) return;
		const read = readField('slate', key, typed, settings.value.units);
		errors = { ...errors, [key]: read.ok ? undefined : issueText(read.issue) };
		if (read.ok) await app.edit.set('slate', record, key, read.value, { key: 'edit.changed', params: { field: fieldLabel(read.def) } });
	}
	async function shoot() {
		const s = slate.value;
		if (!s) return;
		current.select({ shootDayId: s.shootDayId, slateId: s.id });
		await goto('/shoot');
	}
	async function remove() {
		const s = slate.value;
		if (!s) return;
		await app.edit.removeTree('slate', s.id, { key: 'edit.removed', params: { what: t('slates.slate', { slate: s.slateUID ?? '' }) } });
		await goto('/slates');
	}
</script>

<svelte:head><title>{title} · {t('app.name')}</title></svelte:head>

<Page>
	<NavBar {title} large back={{ href: '/slates', label: t('slates.title') }} />
	{#if slate.value}
		<Section header={t('slates.detail.header')}>
			{#each KEYS as key (key)}
				<InputRow label={tk(`field.slate.${key}`)} bind:value={text[key]} onchange={(v) => save(key, v)} error={errors[key]} autocapitalize={key === 'description' ? 'sentences' : 'characters'} />
			{/each}
		</Section>
		<div class="actions"><Button variant="filled" size="large" full onclick={shoot}>{t('slates.detail.shoot')}</Button></div>
		<Section header={t('slates.detail.takes')}>
			{#each rows as row (row.take.id)}
				<Row title={t('take.row', { take: row.take.take ?? '' })} subtitle={row.camera ? t('take.setup', { id: row.camera }) : undefined} detail={formatTime(row.take.startedAt)} />
			{:else}
				<Row title={t('slates.detail.takes.none')} class="quiet" />
			{/each}
		</Section>
		<Section footer={t('slates.detail.footer')}>
			<Row title={t('slates.detail.delete')} destructive onclick={remove} />
		</Section>
	{:else if slate.ready}
		<EmptyState icon={Clapperboard} title={t('slates.missing')} message={t('slates.missing.message')}>
			{#snippet action()}<Button variant="filled" href="/slates">{t('slates.title')}</Button>{/snippet}
		</EmptyState>
	{/if}
</Page>

<style>
	.actions {
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 32px;
	}
</style>
