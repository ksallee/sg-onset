<script lang="ts">
	// The VFX shot codes of the project's slates that several Shots of the Flow PT project have, by
	// slate. A code no Shot has yet is filed as a Set Shot, which is expected, and is not listed
	// (Kevin, #102). Each sync looks again (app/sync/shots.ts). A row opens its slate.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { live } from '$lib/app/live.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { severalRows, type SeveralRow } from '$lib/app/sync/shots';
	import { t } from '$lib/i18n/messages';
	import type { Slate } from '$lib/model/types';

	let { onnavigate }: { onnavigate?: () => void } = $props();

	const sync = useSync();
	const rows = live<SeveralRow[]>(
		['slate'],
		async (store) => {
			const owed = sync.state.shots ?? {};
			const slates = await Promise.all(Object.keys(owed).map((id) => store.get('slate', id)));
			return severalRows(
				owed,
				slates.filter((s): s is Slate => s !== undefined)
			);
		},
		[]
	);
</script>

{#if rows.value.length}
	<Section header={t('sync.shots.header')} footer={t('sync.shots.footer')}>
		{#each rows.value as row (row.slateId)}
			<Row
				title={t('slates.slate', { slate: row.slate })}
				subtitle={t('sync.shots.several', { codes: row.several.join(', ') })}
				href="/slates/{row.slateId}"
				onclick={onnavigate}
				chevron
			/>
		{/each}
	</Section>
{/if}
