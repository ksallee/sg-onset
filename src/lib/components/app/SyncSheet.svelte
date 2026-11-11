<script lang="ts">
	// The sync detail: what waits on this device, what needs a look, the account, the backup.
	// Everything listed is read from the outbox; nothing here knows a table by name, so a new
	// kind of record shows up without a change (its name comes from `scope.<table>` and the
	// record's naming field, app/titles.ts).
	import Button from '$lib/components/ios/Button.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { auth, signOut } from '$lib/auth/session.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { ago } from '$lib/app/format';
	import { live, liveUnsynced } from '$lib/app/live.svelte';
	import { attentionRows, type AttentionAction, type AttentionRow } from '$lib/app/sync';
	import { recordTitle } from '$lib/app/titles';
	import { t, tk } from '$lib/i18n/messages';
	import { isTable } from '$lib/store/tables';
	import BackupRows from './BackupRows.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const app = useApp();
	const unsynced = liveUnsynced();
	const counts = $derived(unsynced.value);
	// What needs a look, each with the name of its record.
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
	const oldest = $derived(counts?.oldest === undefined ? undefined : ago(counts.oldest, app.now()));
	const host = $derived(auth.site ? new URL(auth.site).host : '');

	function act(row: AttentionRow, action: AttentionAction) {
		if (action === 'retry') void app.store.retry(row.entryId);
		else void app.store.resolve(row.entryId, () => action);
	}
</script>

<Sheet bind:open title={t('sync.detail.title')} done={t('common.done')}>
	<Section header={t('sync.detail.waiting')} footer={t('sync.detail.noTransport')}>
		<Row title={t('sync.detail.changes')} detail={String(counts?.entries ?? 0)} />
		<Row title={t('sync.detail.records')} detail={String(counts?.records ?? 0)} />
		<Row title={t('sync.detail.files')} detail={String(counts?.blobs ?? 0)} />
		{#if oldest}<Row title={t('sync.detail.oldest')} detail={t(oldest.key, oldest.params)} />{/if}
		<Row title={t('sync.detail.attention')} detail={String(counts?.attention ?? 0)} />
	</Section>

	{#if attention.value.length}
		<Section header={t('sync.attention.header')} footer={t('sync.attention.footer')}>
			{#each attention.value as row (row.entryId)}
				<Row title={t(`sync.op.${row.kind}`, { what: row.what })} subtitle={row.message ?? t(`sync.attention.${row.reason}`)}>
					{#snippet trailing()}
						{#each row.actions as action (action)}
							<Button size="small" variant={action === 'theirs' ? 'gray' : 'tinted'} onclick={() => act(row, action)}>{t(`sync.attention.${action}`)}</Button>
						{/each}
					{/snippet}
				</Row>
			{/each}
		</Section>
	{/if}

	<Section header={t('sync.account')} footer={auth.status === 'signed-in' ? undefined : auth.status === 'expired' ? t('auth.expired') : t('sync.detail.signedOut')}>
		{#if auth.status === 'signed-in'}
			<Row title={t('auth.site')} detail={host} />
			<Row title={t('auth.user')} detail={auth.user ?? ''} />
			<Row title={t('sync.account.signOut')} destructive onclick={signOut} />
		{:else}
			<Row
				title={auth.status === 'expired' ? t('sync.account.signInAgain') : t('sync.account.signIn')}
				detail={auth.status === 'expired' ? t('sync.account.expired') : t('sync.account.none')}
				href="/sign-in"
				onclick={() => (open = false)}
			/>
		{/if}
	</Section>

	<Section header={t('backup.header')} footer={t('backup.footer')}>
		<BackupRows />
	</Section>
</Sheet>
