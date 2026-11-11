<script lang="ts">
	// How safe the data is, and the snapshots. First the signal: a word and a shape for ok,
	// remind or warn (never colour alone), the reasons in plain text, the last snapshot, the last
	// copy off this device and what exists only here; and, once, what a snapshot does not protect
	// against. Then the snapshots, newest first: a tap shows what restoring one would change,
	// per kind of entry, before anything is done. The facts come from $lib/store/snapshots through
	// snapshotsDriver.svelte.ts; the words are decided in snapshotView.ts.
	import { onDestroy } from 'svelte';
	import { CircleAlert, CircleCheck, TriangleAlert } from '@lucide/svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { ago, formatBytes } from '$lib/app/format';
	import { hasMessage, t, tk } from '$lib/i18n/messages';
	import type { SnapshotInfo } from '$lib/store/snapshots';
	import { SnapshotsDriver } from '../snapshotsDriver.svelte';
	import { previewLines, refusalKey, restorable, safetyView, snapshotWhen } from '../snapshotView';

	const app = useApp();
	const snapshots = new SnapshotsDriver(app.store, app.now, () => location.assign('/settings'));
	onDestroy(snapshots.start());

	const SHAPES = { ok: CircleCheck, remind: CircleAlert, warn: TriangleAlert };
	const safety = $derived(snapshots.signals ? safetyView(snapshots.signals, snapshots.at) : undefined);
	const Shape = $derived(safety ? SHAPES[safety.severity] : CircleCheck);

	const since = (at: number) => {
		const age = ago(at, snapshots.at);
		return t(age.key, age.params);
	};
	const entries = (n: number) => (n === 1 ? t('settings.snapshot.entries.one') : t('settings.snapshot.entries', { n }));
	const when = (info: SnapshotInfo) => {
		const w = snapshotWhen(info.at, snapshots.at);
		return t(`settings.snapshot.${w.day}`, w);
	};
	const line = (info: SnapshotInfo) => t('settings.snapshot.line', { reason: t(`settings.snapshot.reason.${info.reason}`), entries: entries(info.records), size: formatBytes(info.size) });

	// The preview of a restore, in a sheet.
	const opened = $derived(snapshots.opened);
	const view = $derived(opened?.preview ? previewLines(opened.preview, (table) => hasMessage(`scope.${table}`)) : undefined);
	let sheetOpen = $state(false);
	$effect(() => {
		if (opened) sheetOpen = true;
	});
	const parts = (d: { added: number; removed: number; changed: number }) =>
		[d.added && t('settings.snapshot.diff.added', { n: d.added }), d.changed && t('settings.snapshot.diff.changed', { n: d.changed }), d.removed && t('settings.snapshot.diff.removed', { n: d.removed })].filter(Boolean).join(', ');
	const queued = (n: number) => (n === 0 ? t('settings.snapshot.restore.queued.none') : n === 1 ? t('settings.snapshot.restore.queued.one') : t('settings.snapshot.restore.queued', { n }));
</script>

<Section header={t('settings.safety')} footer={t('settings.safety.footer')}>
	{#if safety}
		<div class="signal" role="listitem" data-severity={safety.severity}>
			<span class="shape" aria-hidden="true"><Shape class="size-[26px]" strokeWidth={2.2} /></span>
			<div class="words" role="status">
				<p class="headline">{t(safety.headline)}</p>
				{#each safety.reasons as reason (reason)}<p>{t(reason)}</p>{/each}
			</div>
		</div>
		<Row title={t('settings.safety.localOnly')} detail={safety.localOnly === 0 ? t('settings.safety.localOnly.none') : entries(safety.localOnly)} />
		<Row
			title={t('settings.safety.offDevice')}
			detail={safety.offDevice ? t(safety.offDevice.kind, { when: since(safety.offDevice.at) }) : t('settings.safety.never')}
		/>
		<Row title={t('settings.safety.snapshot')} detail={safety.snapshotAt === undefined ? t('settings.safety.never') : since(safety.snapshotAt)} />
	{:else}
		<Row title={t('settings.safety.snapshot')} detail={t('common.loading')} class="quiet" />
	{/if}
</Section>

<Section header={t('settings.snapshots')} footer={t('settings.snapshots.footer')}>
	{#if snapshots.restored}<p class="say" role="status">{t('settings.snapshot.restored')}</p>{/if}
	{#if snapshots.taking}
		<Row title={t('settings.snapshots.taking')} class="quiet" />
	{:else}
		<Row title={t('settings.snapshots.take')} class="tint" onclick={() => snapshots.take()} />
	{/if}
	{#if snapshots.takeFailed}<p class="say problem" role="alert">{t('settings.snapshots.takeFailed')}</p>{/if}
	{#each snapshots.list ?? [] as info (info.id)}
		{#if restorable(info)}
			<Row title={when(info)} subtitle={line(info)} chevron onclick={() => snapshots.open(info)} />
		{:else}
			<Row title={when(info)} subtitle={line(info)} class="quiet">
				{#snippet trailing()}<span class="damaged"><TriangleAlert class="size-[16px]" strokeWidth={2.4} aria-hidden="true" />{t('settings.snapshot.damaged')}</span>{/snippet}
			</Row>
		{/if}
	{:else}
		{#if snapshots.list}<p class="say">{t('settings.snapshots.none')}</p>{/if}
	{/each}
</Section>

<Sheet bind:open={sheetOpen} title={t('settings.snapshot.restore.title')} done={t('common.cancel')} dismissible={!opened?.restoring} onclose={() => snapshots.close()}>
	{#if opened}
		<Section footer={t('settings.snapshot.restore.lead')}>
			<Row title={when(opened.info)} subtitle={line(opened.info)} />
		</Section>
		{#if opened.refused}
			<p class="alone problem" role="alert">{t(refusalKey(opened.refused === 'other' ? undefined : opened.refused))}</p>
		{:else if !view}
			<p class="alone" role="status">{t('settings.snapshot.restore.checking')}</p>
		{:else if view.same}
			<p class="alone" role="status">{t('settings.snapshot.restore.same')}</p>
		{:else}
			<Section header={t('settings.snapshot.restore.changes')} footer="{queued(view.queued)} {t('settings.snapshot.restore.undo')}">
				{#each view.lines as l (l.table)}
					<Row title={tk(`scope.${l.table}`)} detail={parts(l)} />
				{/each}
				{#if view.other}<Row title={t('settings.snapshot.diff.other')} detail={t('settings.snapshot.diff.changed', { n: view.other })} />{/if}
			</Section>
			<div class="actions">
				<Button variant="filled" size="large" full destructive disabled={opened.restoring} onclick={() => snapshots.restore()}>
					{opened.restoring ? t('settings.snapshot.restore.working') : t('settings.snapshot.restore.confirm')}
				</Button>
			</div>
		{/if}
	{/if}
</Sheet>

<style>
	.signal {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px 16px;
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.shape {
		flex: none;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		margin-top: -2px;
		color: var(--good);
	}
	[data-severity='remind'] .shape {
		color: var(--warning);
	}
	[data-severity='warn'] .shape {
		color: var(--destructive);
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	.headline {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	.say,
	.alone {
		padding: 10px 16px 12px;
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	.alone {
		padding: 0 calc(var(--page-margin, 16px) + 16px) 24px;
		box-shadow: none;
	}
	.problem {
		color: var(--destructive);
	}
	.damaged {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.23px;
		color: var(--destructive);
	}
	.actions {
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 24px;
	}
</style>
