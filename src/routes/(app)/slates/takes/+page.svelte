<script lang="ts">
	// All takes of the current shoot day, to select across slates and edit at once.
	import AllTakes from '$lib/components/slates/AllTakes.svelte';
	import { t } from '$lib/i18n/messages';
</script>

<svelte:head><title>{t('slates.all.title')} · {t('app.name')}</title></svelte:head>

<AllTakes />
