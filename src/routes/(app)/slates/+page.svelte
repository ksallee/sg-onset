<script lang="ts">
	// Slates: the current day's slates, and on an iPad the picked slate beside them.
	import SlatesScreen from '$lib/components/slates/SlatesScreen.svelte';
	import { t } from '$lib/i18n/messages';
</script>

<svelte:head><title>{t('slates.title')} · {t('app.name')}</title></svelte:head>

<SlatesScreen />
