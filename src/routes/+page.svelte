<script lang="ts">
	// The way in: to the first run when the device holds no project, else to Shoot. A returning
	// person never sees the first run (lib/settings/firstRun.ts).
	import { goto } from '$app/navigation';
	import { liveList } from '$lib/app/live.svelte';
	import { t } from '$lib/i18n/messages';
	import { entryRoute } from '$lib/settings/firstRun';

	const projects = liveList('project');
	$effect(() => {
		if (projects.ready) void goto(entryRoute(projects.value.length), { replaceState: true });
	});
</script>

<svelte:head><title>{t('app.name')}</title></svelte:head>
