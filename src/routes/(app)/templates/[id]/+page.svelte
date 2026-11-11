<script lang="ts">
	// One template: its fields, its linked entries, and the review before an edit reaches them.
	import { page } from '$app/state';
	import TemplateEditor from '$lib/components/templates/TemplateEditor.svelte';
	import { t } from '$lib/i18n/messages';
</script>

<svelte:head><title>{t('templates.title')} · {t('app.name')}</title></svelte:head>

{#key page.params.id}<TemplateEditor id={page.params.id ?? ''} />{/key}
