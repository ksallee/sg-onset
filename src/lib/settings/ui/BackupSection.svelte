<script lang="ts">
	// The Backup section of Settings: when a backup last left the device, export one, restore
	// from one. A restore checks the file first, then asks before it replaces anything, in plain
	// words. A snapshot of what is on the device is taken before the replace, so it can be
	// undone from Snapshots. The steps are backupFlow.ts, the work backupDriver.svelte.ts.
	import { onDestroy, untrack } from 'svelte';
	import ActionSheet from '$lib/components/ios/ActionSheet.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { ago } from '$lib/app/format';
	import { t } from '$lib/i18n/messages';
	import { createSnapshotter, type Snapshotter } from '$lib/store/snapshots';
	import { BackupDriver } from '../backupDriver.svelte';
	import { device } from '../device.svelte';

	const app = useApp();
	// The app's one snapshotter, once `useApp()` exposes it as `app.snapshotter`. Until then a
	// snapshotter of this section's own, let go when the section goes.
	const shared = (app as { snapshotter?: Snapshotter }).snapshotter;
	const snapshotter = shared ?? createSnapshotter({ snapshots: app.store.snapshots, subscribe: app.store.subscribe });
	if (!shared) onDestroy(() => snapshotter.stop());
	const backup = new BackupDriver({
		store: app.store,
		now: app.now,
		snapshotBefore: (reason) => snapshotter.snapshotBefore(reason),
		onHanded: (at) => device.update({ lastBackupAt: at }),
		// Everything on the page was read from the old data: start again, here, on the new.
		onReplaced: () => location.assign('/settings')
	});
	const view = $derived(backup.state);
	const restore = $derived(view.restore);

	const last = $derived.by(() => {
		const at = device.value.lastBackupAt;
		if (at === undefined) return t('settings.backup.never');
		const age = ago(at, app.now());
		return t(age.key, age.params);
	});

	let picker = $state<HTMLInputElement | null>(null);
	function picked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		// Emptied, so the same file can be picked again.
		input.value = '';
		if (file) void backup.pick(file);
	}

	// The question before a replace. Closing the sheet any other way is a no.
	let confirmOpen = $state(false);
	$effect(() => {
		if (restore.step === 'confirm') confirmOpen = true;
	});
	$effect(() => {
		if (!confirmOpen && untrack(() => backup.state.restore.step) === 'confirm') backup.cancel();
	});
	// The second question, when no snapshot could be taken first.
	let unprotectedOpen = $state(false);
	$effect(() => {
		if (restore.step === 'unprotected') unprotectedOpen = true;
	});
	$effect(() => {
		if (!unprotectedOpen && untrack(() => backup.state.restore.step) === 'unprotected') backup.cancel();
	});

</script>

<Section header={t('backup.header')} footer={t('backup.footer')}>
	<Row title={t('settings.backup.last')} detail={last} />

	{#if view.export === 'ready'}
		<Row title={t('backup.share')} detail={t('backup.ready')} class="tint" onclick={() => backup.share()} />
	{:else if view.export === 'working'}
		<Row title={t('backup.exporting')} class="quiet" />
	{:else}
		<Row title={t('backup.export')} class="tint" onclick={() => backup.export()} />
	{/if}
	{#if view.export === 'failed'}<p class="say problem" role="alert">{t('backup.failed')}</p>{/if}

	{#if restore.step === 'checking' || restore.step === 'replacing'}
		<Row title={restore.step === 'checking' ? t('settings.backup.checking') : t('settings.backup.replacing')} detail={restore.file.name} class="quiet" />
	{:else}
		<Row title={t('backup.restore')} class="tint" onclick={() => picker?.click()} />
	{/if}
	{#if restore.step === 'refused'}
		<p class="say problem" role="alert">{t(`backup.refused.${restore.reason}`)}</p>
	{:else if restore.step === 'done'}
		<p class="say" role="status">{t('backup.restored', { records: restore.records, files: restore.files })}</p>
	{/if}
</Section>

<input class="picker" type="file" accept=".zip,application/zip" tabindex="-1" aria-hidden="true" bind:this={picker} onchange={picked} />

<ActionSheet
	bind:open={confirmOpen}
	title={t('backup.replace.title')}
	message={t('settings.backup.replace.undo')}
	actions={[
		{ label: t('settings.backup.replace.confirm'), role: 'destructive', run: () => void backup.confirm() },
		{ label: t('common.cancel'), role: 'cancel', run: () => backup.cancel() }
	]}
/>

<ActionSheet
	bind:open={unprotectedOpen}
	title={t('settings.backup.noSnapshot.title')}
	message={t('settings.backup.noSnapshot')}
	actions={[
		{ label: t('settings.backup.noSnapshot.confirm'), role: 'destructive', run: () => void backup.confirm() },
		{ label: t('common.cancel'), role: 'cancel', run: () => backup.cancel() }
	]}
/>

<style>
	.picker {
		display: none;
	}
	.say {
		padding: 8px 16px 12px;
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	.say.problem {
		color: var(--destructive);
	}
</style>
