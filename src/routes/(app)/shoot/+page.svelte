<script lang="ts">
	// Shoot: the take screen for the slate being shot, read from and written to the store. The
	// state and actions are lib/take/shoot.svelte.ts, the parts lib/components/take, the frame the
	// kit's Workspace. With no slate picked: the slates of the day to pick from.
	import { CalendarDays, Clapperboard } from '@lucide/svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Workspace from '$lib/components/ios/Workspace.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import CaptureRail from '$lib/components/take/CaptureRail.svelte';
	import NumberDock from '$lib/components/take/NumberDock.svelte';
	import TakeDetail from '$lib/components/take/TakeDetail.svelte';
	import TakeList from '$lib/components/take/TakeList.svelte';
	import TakeSheet from '$lib/components/take/TakeSheet.svelte';
	import TakeTray from '$lib/components/take/TakeTray.svelte';
	import UndoNotice from '$lib/components/take/UndoNotice.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { useShell } from '$lib/app/shell.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { captureTarget } from '$lib/ios/target';
	import type { Slate } from '$lib/model/types';
	import { Shoot } from '$lib/take/shoot.svelte';

	const current = useCurrent();
	const shell = useShell();
	const shoot = new Shoot(useApp(), current);
	const large = $derived(settings.value.buttonSize === 'large');
	const target = $derived(captureTarget(large));
	let sheet = $state(false);

	const about = (slate: Slate) => [slate.sceneNumber ? t('slates.scene', { scene: slate.sceneNumber }) : '', slate.description].filter(Boolean).join(' · ');
	const title = $derived(current.slate ? `${t('take.title', { slate: current.slate.slateUID ?? '', take: shoot.group?.number ?? '–' })} · ${t('app.name')}` : `${t('shoot.title')} · ${t('app.name')}`);
</script>

<svelte:head><title>{title}</title></svelte:head>

{#if current.slate}
	<Workspace hand={settings.value.hand} target={target.size} gap={target.gap}>
		{#snippet list(at)}
			<TakeList {shoot} {at} onslate={() => current.select({ slateId: undefined })} />
		{/snippet}
		{#snippet main(form)}
			<TakeDetail {shoot} {form} onnote={() => (sheet = true)} />
			<!-- A phone with the keypad up has room for the number only. -->
			{#if !(form === 'compact' && shoot.field)}<UndoNotice issue={shoot.photoIssue} since={shoot.openedAt} />{/if}
		{/snippet}
		{#snippet dock(form)}
			{#if shoot.field}
				<NumberDock {shoot} {form} hand={settings.value.hand} gloves={large} />
			{:else}
				<TakeTray {shoot} {form} onnote={() => (sheet = true)} />
			{/if}
		{/snippet}
		{#snippet rail(edge)}
			<CaptureRail {shoot} {edge} />
		{/snippet}
	</Workspace>
	<TakeSheet {shoot} bind:open={sheet} />
{:else}
	<Page>
		<NavBar title={t('shoot.title')} large />
		<ContextBar />
		{#if !current.shootDay}
			<EmptyState icon={CalendarDays} title={t('shoot.noDay')} message={t('shoot.noDay.message')}>
				{#snippet action()}<Button variant="filled" onclick={() => shell.openContext()}>{t('shoot.noDay.action')}</Button>{/snippet}
			</EmptyState>
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
	</Page>
{/if}
