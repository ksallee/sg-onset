<script lang="ts">
	// The lists a show shares (#110, app/sync/shared.ts). On a site without the Project fields, the
	// changes to templates and reference kinds that wait, and what an admin does. Then the entries
	// changed on another device that this device uses, until seen: opening a row marks it seen
	// (Kevin, #110). Then the records removed on another device and kept here, used or changed here,
	// this session. A row opens one.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { live, liveQueue } from '$lib/app/live.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { changedFields } from '$lib/app/sync/changed';
	import { listsWaiting, sharedHref, type Kept } from '$lib/app/sync/shared';
	import { recordTitle } from '$lib/app/titles';
	import { t, tk } from '$lib/i18n/messages';

	let { onnavigate }: { onnavigate?: () => void } = $props();

	const sync = useSync();
	const queue = liveQueue();
	const waiting = $derived(listsWaiting(queue.value));
	const changed = live<{ table: Kept['table']; id: string; title: string; fields: string; href?: string }[]>(
		['camera', 'lens', 'cameraSetup', 'lightingSetup', 'template', 'referenceKind'],
		async (store) => {
			// Read before the first await: the effect then follows it.
			const list = sync.state.changed;
			const rows = await Promise.all(list.map(async (c) => ({ c, row: await store.get(c.table, c.id) })));
			return rows.flatMap(({ c, row }) =>
				row ? [{ table: c.table, id: c.id, title: `${tk(`scope.${c.table}`)} ${recordTitle(c.table, row)}`.trim(), fields: changedFields(c.table, c.keys), href: sharedHref(c) }] : []
			);
		},
		[]
	);
	const kept = live<(Kept & { title: string; href?: string })[]>(
		['camera', 'lens', 'cameraSetup', 'lightingSetup', 'template', 'referenceKind'],
		async (store) => {
			// Read before the first await: the effect then follows it.
			const list = sync.state.kept ?? [];
			const rows = await Promise.all(list.map(async (k) => ({ k, row: await store.get(k.table, k.id) })));
			// A record removed here since is no longer listed.
			return rows.flatMap(({ k, row }) => (row ? [{ ...k, title: `${tk(`scope.${k.table}`)} ${recordTitle(k.table, row)}`.trim(), href: sharedHref(k) }] : []));
		},
		[]
	);
</script>

{#if sync.state.listsMissing}
	<Section header={t('sync.lists.header')} footer={t('sync.lists.footer')}>
		<Row title={t('sync.lists.waiting')} detail={String(waiting)} />
	</Section>
{/if}

{#if changed.value.length}
	<Section header={t('sync.changed.header')} footer={t('sync.changed.footer')}>
		{#each changed.value as row (`${row.table}.${row.id}`)}
			<Row
				title={row.title}
				subtitle={t('sync.changed.fields', { fields: row.fields })}
				href={row.href}
				onclick={() => {
					void sync.seenChanged(row.table, row.id);
					if (row.href) onnavigate?.();
				}}
				chevron={row.href !== undefined}
			/>
		{/each}
	</Section>
{/if}

{#if kept.value.length}
	<Section header={t('sync.kept.header')} footer={t('sync.kept.footer')}>
		{#each kept.value as row (`${row.table}.${row.id}`)}
			<Row title={row.title} subtitle={t('sync.kept.subtitle')} href={row.href} onclick={row.href ? onnavigate : undefined} chevron={row.href !== undefined} />
		{/each}
	</Section>
{/if}
