<script lang="ts">
	// The FPT project the current project syncs to: pick one from those the person can see, or
	// unlink. Linking runs the setup check, which only reads.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { auth } from '$lib/auth/session.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import type { ProjectChoice } from '$lib/app/sync/projects';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { t } from '$lib/i18n/messages';
	import { syncError, syncErrorText } from '$lib/app/sync/errors';

	const sync = useSync();
	const current = useCurrent();
	const project = $derived(current.project?.name ?? '');

	let picking = $state(false);
	let loading = $state(false);
	let choices = $state.raw<ProjectChoice[]>([]);
	let problem = $state('');

	async function pick() {
		picking = true;
		loading = true;
		problem = '';
		try {
			choices = await sync.listProjects();
		} catch (error) {
			problem = syncErrorText(syncError(error));
			picking = false;
		} finally {
			loading = false;
		}
	}

	async function choose(choice: ProjectChoice) {
		problem = '';
		const done = await sync.link(choice);
		if (done === 'otherProject') problem = t('sync.link.taken');
		picking = false;
	}

	const footer = $derived(
		problem ||
			(!auth.canSync && !sync.state.link
				? t('sync.link.signIn')
				: sync.state.link
					? t('sync.link.footer', { project })
					: t('sync.link.none.footer', { project }))
	);
</script>

<Section header={t('sync.link.header')} {footer}>
	{#if sync.state.link}
		<Row title={t('sync.link.project')} detail={sync.state.link.name || String(sync.state.link.projectId)} />
		<Row title={t('sync.link.unlink')} destructive onclick={() => void sync.unlink()} />
	{:else if picking}
		{#if loading}
			<Row title={t('sync.link.loading')} />
		{:else}
			{#each choices as choice (choice.id)}
				<Row title={choice.name} onclick={() => void choose(choice)} chevron />
			{:else}
				<Row title={t('sync.link.empty')} />
			{/each}
			<Row title={t('common.cancel')} onclick={() => (picking = false)} />
		{/if}
	{:else if auth.canSync}
		<Row title={t('sync.link.choose')} onclick={pick} chevron />
	{/if}
</Section>
