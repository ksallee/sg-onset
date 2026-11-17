<script lang="ts">
	// The VFX shot codes of the project's slates to check, by slate: those no Shot of the Flow PT
	// project has yet, and those several Shots have. Each sync looks again (app/sync/shots.ts). A
	// row opens its slate, to fix a code.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { live } from '$lib/app/live.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { waitingRows, type WaitingRow } from '$lib/app/sync/shots';
	import { t } from '$lib/i18n/messages';
	import type { Slate } from '$lib/model/types';

	let { onnavigate }: { onnavigate?: () => void } = $props();

	const sync = useSync();
	const rows = live<WaitingRow[]>(
		['slate'],
		async (store) => {
			const waiting = sync.state.shots ?? {};
			const slates = await Promise.all(Object.keys(waiting).map((id) => store.get('slate', id)));
			return waitingRows(
				waiting,
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
				subtitle={[
					row.none.length ? t('sync.shots.none', { codes: row.none.join(', ') }) : '',
					row.several.length ? t('sync.shots.several', { codes: row.several.join(', ') }) : ''
				]
					.filter(Boolean)
					.join(' · ')}
				href="/slates/{row.slateId}"
				onclick={onnavigate}
				chevron
			/>
		{/each}
	</Section>
{/if}
