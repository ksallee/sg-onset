<script lang="ts">
	// The rows of a Backup section: export, then share or save the file; with `restore`, restore
	// from a file too. Put it inside a Section. The state is app/backup.svelte.ts.
	import ActionSheet from '$lib/components/ios/ActionSheet.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { Backup } from '$lib/app/backup.svelte';
	import { t } from '$lib/i18n/messages';

	let { restore = false }: { restore?: boolean } = $props();

	const app = useApp();
	const backup = new Backup(app.store, app.now);
	let picker = $state<HTMLInputElement | null>(null);
	let pending = $state<File | null>(null);
	let confirm = $state(false);

	async function run(file: File, replace: boolean) {
		if (await backup.restore(file, replace)) {
			// Everything on the page was read from the old data: start again from the restored one.
			location.assign('/');
		} else if (backup.refusal === 'backup.refused.notEmpty') {
			pending = file;
			confirm = true;
		}
	}
	function picked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void run(file, false);
	}
</script>

{#if backup.phase === 'ready'}
	<Row title={t('backup.share')} subtitle={t('backup.ready')} onclick={() => backup.share()} />
{:else if backup.phase === 'exporting'}
	<Row title={t('backup.exporting')} />
{:else}
	<Row title={t('backup.export')} subtitle={backup.phase === 'failed' ? t('backup.failed') : undefined} onclick={() => backup.export()} />
{/if}
{#if restore}
	<Row
		title={backup.phase === 'restoring' ? t('backup.restoring') : t('backup.restore')}
		subtitle={backup.refusal && backup.refusal !== 'backup.refused.notEmpty' ? t(backup.refusal) : undefined}
		onclick={backup.phase === 'restoring' ? undefined : () => picker?.click()}
	/>
	<input class="picker" type="file" accept=".zip,application/zip" tabindex="-1" aria-hidden="true" bind:this={picker} onchange={picked} />
	<ActionSheet
		bind:open={confirm}
		title={t('backup.replace.title')}
		message={t('backup.replace.message')}
		actions={[
			{ label: t('backup.replace.confirm'), role: 'destructive', run: () => pending && run(pending, true) },
			{ label: t('common.cancel'), role: 'cancel', run: () => (pending = null) }
		]}
	/>
{/if}

<style>
	.picker {
		display: none;
	}
</style>
