<script lang="ts">
	// Placeholder: one kit Screen and NavBar, to prove the kit and the PWA shell.
	import Screen from '$lib/components/ios/Screen.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import { readStandalone } from '$lib/pwa/platform';

	const installed = readStandalone();
</script>

<svelte:head><title>sg-onset</title></svelte:head>

<Screen>
	<NavBar title="sg-onset" large />
	<Section header="Status" footer="On-set VFX data capture for Flow Production Tracking.">
		<Row title="Build" detail="Scaffold" />
		<Row title="Home Screen" detail={installed ? 'Installed' : 'In the browser'} />
	</Section>
</Screen>
