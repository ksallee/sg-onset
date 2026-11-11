<script lang="ts">
	// What waits on this device, by kind, and what needs attention: what happened in words, both
	// values of a conflict, and the ways out the outbox has (Try Again, Keep Mine, Keep Flow PT's).
	// Read from the outbox alone: a new kind of entry shows with its `scope.<table>` name.
	import Button from '$lib/components/ios/Button.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { ago } from '$lib/app/format';
	import { live, liveQueue, liveUnsynced } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { attentionRows, type AttentionAction, type AttentionRow } from '$lib/app/sync';
	import { conflictLines, pendingByKind } from '$lib/app/sync/queue';
	import { recordTitle } from '$lib/app/titles';
	import { t, tk } from '$lib/i18n/messages';
	import { isTable } from '$lib/store/tables';

	let { elsewhere = 0 }: { elsewhere?: number } = $props();

	const app = useApp();
	const queue = liveQueue();
	const unsynced = liveUnsynced();
	const kinds = $derived(pendingByKind(queue.value));
	const oldest = $derived(unsynced.value?.oldest === undefined ? undefined : ago(unsynced.value.oldest, app.now()));
	const attention = live<(AttentionRow & { what: string })[]>(
		[],
		async (store) => {
			const rows = attentionRows(await store.outbox.entries());
			return Promise.all(
				rows.map(async (row) => {
					const record = isTable(row.table) ? await store.get(row.table, row.recordId) : undefined;
					return { ...row, what: `${tk(`scope.${row.table}`)} ${recordTitle(row.table, record)}`.trim() };
				})
			);
		},
		[]
	);

	function act(row: AttentionRow, action: AttentionAction) {
		if (action === 'retry') void app.store.retry(row.entryId);
		else void app.store.resolve(row.entryId, () => action);
	}
</script>

<Section header={t('sync.pending.header')} footer={elsewhere > 0 ? t('sync.run.otherProjects') : undefined}>
	{#each kinds as k (k.kind)}
		<Row title={k.kind === 'file' ? t('sync.pending.files') : tk(`scope.${k.kind}`)} detail={String(k.count)} />
	{:else}
		<Row title={t('sync.detail.none')} />
	{/each}
	{#if oldest}<Row title={t('sync.detail.oldest')} detail={t(oldest.key, oldest.params)} />{/if}
</Section>

{#if attention.value.length}
	<Section header={t('sync.attention.header')} footer={t('sync.attention.footer')}>
		{#each attention.value as row (row.entryId)}
			<Row subtitle={row.message ?? t(`sync.attention.${row.reason}`)}>
				{#snippet title()}
					<span class="what">{t(`sync.op.${row.kind}`, { what: row.what })}</span>
					{#each conflictLines(row.table, row.conflicts, settings.value.units) as line (line.key)}
						<span class="conflict">{t('sync.conflict.line', { field: line.label, mine: line.mine, theirs: line.theirs })}</span>
					{/each}
				{/snippet}
				{#snippet trailing()}
					<span class="actions">
						{#each row.actions as action (action)}
							<Button size="small" variant={action === 'theirs' ? 'gray' : 'tinted'} onclick={() => act(row, action)}>{t(`sync.attention.${action}`)}</Button>
						{/each}
					</span>
				{/snippet}
			</Row>
		{/each}
	</Section>
{/if}

<style>
	.what,
	.conflict {
		display: block;
	}
	.conflict {
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
</style>
