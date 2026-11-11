<script lang="ts">
	// The way in: to the first run when the device holds no project, else to Shoot.
	import { goto } from '$app/navigation';
	import { liveList } from '$lib/app/live.svelte';
	import { t } from '$lib/i18n/messages';

	const projects = liveList('project');
	$effect(() => {
		if (projects.ready) void goto(projects.value.length ? '/shoot' : '/welcome', { replaceState: true });
	});
</script>

<svelte:head><title>{t('app.name')}</title></svelte:head>
