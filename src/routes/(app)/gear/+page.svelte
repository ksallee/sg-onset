<script lang="ts">
	// Gear, for now: an empty state that says what the project already holds. The gear screens
	// take this page's place (docs/areas.md).
	import { Camera } from '@lucide/svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { gearCounts, hasGear } from '$lib/gear/summary';
	import { t } from '$lib/i18n/messages';

	const current = useCurrent();
	const cameras = liveList('camera', () => current.project?.id);
	const lenses = liveList('lens', () => current.project?.id);
	const setups = liveList('cameraSetup', () => current.project?.id);
	const counts = $derived(gearCounts(cameras.value, lenses.value, setups.value));
</script>

<svelte:head><title>{t('gear.title')} · {t('app.name')}</title></svelte:head>

<Page>
	<NavBar title={t('gear.title')} large />
	<ContextBar day={false} />
	{#if hasGear(counts)}
		<EmptyState icon={Camera} title={t('gear.soon')} message="{t('gear.counts', { ...counts })} {t('gear.soon.message')}" />
	{:else}
		<EmptyState icon={Camera} title={t('gear.empty')} message={t('gear.empty.message')} />
	{/if}
</Page>
