<script lang="ts">
	// The app proper: every page here sits in the shell and has a project to work in. A device
	// with no project goes to the first run.
	import { goto } from '$app/navigation';
	import AppShell from '$lib/components/app/AppShell.svelte';
	import { provideCurrent } from '$lib/app/current.svelte';

	let { children } = $props();

	const current = provideCurrent();
	$effect(() => {
		if (current.ready && current.projects.length === 0) void goto('/welcome', { replaceState: true });
	});
</script>

<AppShell>
	{#if current.project}{@render children()}{/if}
</AppShell>
