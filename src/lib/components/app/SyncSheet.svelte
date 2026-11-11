<script lang="ts">
	// The sync detail: the state and Sync Now, what waits by kind, what needs attention, the Flow
	// PT project, the site's setup, the account, the backup. The work is in app/sync; this lays it out.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { auth, signOut } from '$lib/auth/session.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { ago } from '$lib/app/format';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { syncErrorText } from '$lib/app/sync/errors';
	import { t } from '$lib/i18n/messages';
	import BackupRows from './BackupRows.svelte';
	import LinkSection from './sync/LinkSection.svelte';
	import PrototypeNote from './sync/PrototypeNote.svelte';
	import QueueSections from './sync/QueueSections.svelte';
	import SetupSections from './sync/SetupSections.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const app = useApp();
	const sync = useSync();
	const host = $derived(auth.site ? new URL(auth.site).host : '');
	const status = $derived(t(sync.status.key, { n: sync.status.count }));
	const last = $derived(sync.state.lastSyncAt === undefined ? undefined : ago(sync.state.lastSyncAt, app.now()));
	const busy = $derived(sync.state.running && (sync.state.phase === 'sending' || sync.state.phase === 'checking' || sync.state.phase === 'uploading'));
	const footer = $derived(
		sync.state.error
			? t('sync.run.error', { message: syncErrorText(sync.state.error) })
			: sync.state.stopped === 'unauthorized'
				? t('sync.run.halted.unauthorized')
				: !sync.state.online
					? t('sync.run.halted.offline')
					: t('sync.run.footer')
	);
</script>

<Sheet bind:open title={t('sync.detail.title')} done={t('common.done')}>
	<PrototypeNote />

	<Section header={t('sync.run.header')} {footer}>
		<Row title={status} />
		<Row title={t('sync.run.last')} detail={last ? t(last.key, last.params) : t('sync.run.never')} />
		{#if sync.state.running}
			<Row title={busy ? t('sync.run.running') : t('sync.run.now')} onclick={busy ? undefined : () => void sync.syncNow()} chevron={false} />
		{/if}
	</Section>

	<QueueSections elsewhere={sync.elsewhere} />

	<LinkSection />

	{#if sync.state.link}<SetupSections />{/if}

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
