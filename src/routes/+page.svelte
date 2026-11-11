<script lang="ts">
	// Placeholder: one kit Screen and NavBar, to prove the kit and the PWA shell, and the way
	// into the prototypes.
	import Screen from '$lib/components/ios/Screen.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import { t } from '$lib/i18n/messages';
	import { readStandalone } from '$lib/pwa/platform';

	const installed = readStandalone();
</script>

<svelte:head><title>{t('app.name')}</title></svelte:head>

<Screen>
	<NavBar title={t('app.name')} large />
	<Section header={t('home.prototypes')}>
		<Row title={t('home.proto.take')} detail={t('home.proto.take.detail')} href="/proto/take" />
	</Section>
	<Section header={t('home.status')} footer={t('home.footer')}>
		<Row title={t('home.build')} detail={t('home.build.value')} />
		<Row title={t('home.installed')} detail={installed ? t('home.installed.yes') : t('home.installed.no')} />
	</Section>
</Screen>
