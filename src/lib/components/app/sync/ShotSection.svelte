<script lang="ts">
	// The VFX shot codes of the project's slates whose Set Shot holds several Shots of that code, by
	// slate, from what the last sync read (app/sync/shots.ts). A code no Shot has yet is filed as a Set
	// Shot, which is expected, and is not listed (Kevin, #102). A row opens its slate. On a site with
	// no Set Shot, what waits for it (Kevin, #117).
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { live } from '$lib/app/live.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { projectSlates, severalRows, waitingForSetShot, type SeveralRow } from '$lib/app/sync/shots';
	import { entityName } from '$lib/fpt/naming';
	import { t } from '$lib/i18n/messages';
	import type { ShootDay, Slate } from '$lib/model/types';

	let { onnavigate }: { onnavigate?: () => void } = $props();

	const sync = useSync();
	const view = live<{ rows: SeveralRow[]; waiting: number }>(
		['slate', 'shootDay'],
		async (store) => {
			// Read before the first await: the effect then follows them.
			const projectId = sync.state.projectId;
			const several = sync.state.several ?? {};
			if (!projectId) return { rows: [], waiting: 0 };
			const slates = projectSlates((await store.rows('shootDay')) as ShootDay[], (await store.rows('slate')) as Slate[], projectId);
			return { rows: severalRows(several, slates), waiting: waitingForSetShot(slates) };
		},
		{ rows: [], waiting: 0 }
	);
</script>

{#if sync.state.setShotsMissing}
	<Section header={t('sync.setShots.header')} footer={t('sync.setShots.footer', { name: entityName(sync.state.naming, 'setShot') })}>
		<Row title={t('sync.setShots.waiting')} detail={String(view.value.waiting)} />
	</Section>
{/if}

{#if view.value.rows.length}
	<Section header={t('sync.shots.header')} footer={t('sync.shots.footer')}>
		{#each view.value.rows as row (row.slateId)}
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
