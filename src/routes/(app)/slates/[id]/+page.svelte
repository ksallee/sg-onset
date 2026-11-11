<script lang="ts">
	// One slate: beside the list on an iPad, pushed over it on a phone.
	import { page } from '$app/state';
	import SlatesScreen from '$lib/components/slates/SlatesScreen.svelte';
	import { t } from '$lib/i18n/messages';
</script>

<svelte:head><title>{t('slates.title')} · {t('app.name')}</title></svelte:head>

<SlatesScreen id={page.params.id} />
