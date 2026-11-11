<script lang="ts">
	// Templates: the project's slate and take templates.
	import TemplatesList from '$lib/components/templates/TemplatesList.svelte';
	import { t } from '$lib/i18n/messages';
</script>

<svelte:head><title>{t('templates.title')} · {t('app.name')}</title></svelte:head>

<TemplatesList />
