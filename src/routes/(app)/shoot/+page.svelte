<script lang="ts">
	// Shoot, for now: the slate being shot and its takes, read from the store. The take screen
	// takes this page's place (docs/areas.md); the prototype stays at /proto/take meanwhile.
	import { Clapperboard } from '@lucide/svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatTime } from '$lib/app/format';
	import { liveList } from '$lib/app/live.svelte';
	import { t } from '$lib/i18n/messages';
	import type { Slate } from '$lib/model/types';
	import { takeRows, type TakeRow } from '$lib/app/takeRows';

	const current = useCurrent();
	const takes = liveList('take', () => current.slate?.id);
	const setups = liveList('cameraSetup', () => current.project?.id);
	const lenses = liveList('lens', () => current.project?.id);
	const rows = $derived(takeRows(takes.value, setups.value, lenses.value));

	const about = (slate: Slate) => [slate.sceneNumber ? t('slates.scene', { scene: slate.sceneNumber }) : '', slate.description].filter(Boolean).join(' · ');
	const what = (row: TakeRow) =>
		[
			row.camera ? t('take.setup', { id: row.camera }) : '',
			row.focal ? `${row.focal} ${t('unit.mm')}` : '',
			row.take.tStop === undefined ? '' : `${t('unit.t')}${row.take.tStop}`,
			row.take.circleTake ? t('shoot.take.circled') : '',
			row.take.noGood ? t('shoot.take.noGood') : ''
		]
			.filter(Boolean)
			.join(' · ');
</script>

<svelte:head><title>{t('shoot.title')} · {t('app.name')}</title></svelte:head>

<Page>
	<NavBar title={t('shoot.title')} large />
	<ContextBar />

	{#if current.slate}
		{@const slate = current.slate}
		<Section header={t('shoot.slate')}>
			<Row title={t('slates.slate', { slate: slate.slateUID ?? '' })} subtitle={about(slate) || undefined} href="/slates/{slate.id}" />
			<Row title={t('shoot.slate.change')} class="tint" onclick={() => current.select({ slateId: undefined })} />
		</Section>
		<Section header={t('shoot.takes')} footer={t('shoot.takes.footer')}>
			{#each rows as row (row.take.id)}
				<Row title={t('take.row', { take: row.take.take ?? '' })} subtitle={what(row) || undefined} detail={formatTime(row.take.startedAt)} />
			{:else}
				<Row title={t('shoot.takes.none')} class="quiet" />
			{/each}
		</Section>
	{:else if current.slates.length}
		<Section header={t('shoot.slate.pick')} footer={t('shoot.slate.pick.footer')}>
			{#each current.slates as slate (slate.id)}
				<Row title={t('slates.slate', { slate: slate.slateUID ?? '' })} subtitle={about(slate) || undefined} chevron onclick={() => current.select({ slateId: slate.id })} />
			{/each}
		</Section>
	{:else}
		<EmptyState icon={Clapperboard} title={t('shoot.noSlates')} message={t('shoot.noSlates.message')}>
			{#snippet action()}<Button variant="filled" href="/slates">{t('shoot.noSlates.action')}</Button>{/snippet}
		</EmptyState>
	{/if}

	<Section>
		<Row title={t('shoot.proto')} detail={t('shoot.proto.detail')} href="/proto/take" />
	</Section>
</Page>
