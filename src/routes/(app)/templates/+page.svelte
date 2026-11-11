<script lang="ts">
	// Templates, for now: an empty state. The templates work takes this page's place
	// (docs/areas.md).
	import { LayoutTemplate } from '@lucide/svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import { t } from '$lib/i18n/messages';
</script>

<svelte:head><title>{t('templates.title')} · {t('app.name')}</title></svelte:head>

<Page>
	<NavBar title={t('templates.title')} large />
	<EmptyState icon={LayoutTemplate} title={t('templates.empty')} message={t('templates.empty.message')} />
</Page>
