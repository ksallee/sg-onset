<script lang="ts">
	// Where the person is working: the project and the shoot day, as one row at the head of a
	// page. A tap opens the picker. `day = false` for a page that is about the project only.
	import { Clapperboard } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import { dayName } from '$lib/app/context';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatDate } from '$lib/app/format';
	import { useShell } from '$lib/app/shell.svelte';
	import { t } from '$lib/i18n/messages';

	let { day = true }: { day?: boolean } = $props();

	const current = useCurrent();
	const shell = useShell();
	const line = $derived.by(() => {
		const d = current.shootDay;
		if (!day || !d) return undefined;
		const n = dayName(d);
		return [t('context.day.line', { day: t(n.key, n.params), date: formatDate(d.shootDate) }), d.location].filter(Boolean).join(' · ');
	});
</script>

<Section>
	<Row title={current.project?.name ?? t('context.none')} subtitle={line} chevron onclick={() => shell.openContext()}>
		{#snippet leading()}<Tile icon={Clapperboard} color="var(--tint)" />{/snippet}
	</Row>
</Section>
