<script lang="ts">
	// The slate's setup diagram on its page: one row that says whether it is drawn and opens it.
	import { liveList } from '$lib/app/live.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { isBlank } from '$lib/draw/drawing';
	import { t } from '$lib/i18n/messages';
	import type { Slate } from '$lib/model/types';
	import SetupDiagram from './SetupDiagram.svelte';

	let { slate }: { slate: Slate } = $props();

	const rows = liveList('diagram', () => slate.id);
	const drawn = $derived(!isBlank(rows.value[0]));
	let open = $state(false);
</script>

<Section header={t('draw.diagram.header')} footer={t('draw.diagram.footer')}>
	<Row title={t('draw.diagram.open')} detail={drawn ? t('draw.diagram.drawn') : t('draw.diagram.none')} chevron onclick={() => (open = true)} />
</Section>

{#if open}
	<SetupDiagram {slate} onclose={() => (open = false)} />
{/if}
