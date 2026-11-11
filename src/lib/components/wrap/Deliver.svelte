<script lang="ts">
	// The wrap package: its size before it is made, what to know about that size, the build with
	// progress and Cancel, then the hand-over (share sheet or download). State in wrap.svelte.ts.
	import ActionSheet from '$lib/components/ios/ActionSheet.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { formatBytes } from '$lib/app/format';
	import { t, tk } from '$lib/i18n/messages';
	import { plural } from '$lib/wrap/make';
	import type { Wrap } from '$lib/wrap/wrap.svelte';

	let { wrap }: { wrap: Wrap } = $props();
	let confirm = $state(false);

	const plan = $derived(wrap.plan);
	const files = $derived(plan?.entries.length ?? 0);
	const size = $derived(plan ? t('wrap.package.size', { size: formatBytes(plan.bytes), files: tk(plural('wrap.package.files', files), { n: files }) }) : '');
	const warnings = $derived.by(() => {
		const v = wrap.verdict;
		const out: string[] = [];
		if (v.noRoom) out.push(t('wrap.size.noRoom', { size: formatBytes(wrap.storage.value?.free ?? 0) }));
		if (v.level === 'huge') out.push(t('wrap.size.huge'));
		else if (v.level === 'large') out.push(t('wrap.size.large'));
		if (v.inMemory && v.level !== 'ok') out.push(t('wrap.size.inMemory'));
		return out;
	});
	const blocked = $derived(wrap.readiness !== 'ok' || !plan || files === 0);
	const share = $derived(wrap.mode === 'share');
	const pct = $derived(wrap.progress.total ? Math.min(1, wrap.progress.done / wrap.progress.total) : 0);

	function make() {
		if (wrap.verdict.level === 'huge' || wrap.verdict.noRoom) confirm = true;
		else void wrap.build();
	}
</script>

<Section header={t('wrap.package.header')} footer={t('wrap.package.footer')}>
	<div class="deliver" role="listitem">
		{#if wrap.phase === 'building'}
			<div class="line">
				<span>{t('wrap.package.making')}</span>
				<span class="num">{t('wrap.package.progress', { done: formatBytes(wrap.progress.done), total: formatBytes(wrap.progress.total) })}</span>
			</div>
			<div class="bar" role="progressbar" aria-label={t('wrap.package.making')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
				<span style:transform="scaleX({pct})"></span>
			</div>
			<Button variant="gray" full onclick={() => wrap.cancel()}>{t('wrap.package.cancel')}</Button>
		{:else if (wrap.phase === 'ready' || wrap.phase === 'handed') && plan}
			<div class="line"><span class="name">{t('wrap.package.ready', { name: plan.fileName })}</span><span class="num">{formatBytes(wrap.progress.total)}</span></div>
			{#if wrap.message}<p class="said" role="status">{wrap.message}</p>{/if}
			<Button variant="filled" size="large" full onclick={() => wrap.share()}>{share ? t('wrap.package.share') : t('wrap.package.download')}</Button>
			{#if share}<Button variant="gray" full onclick={() => wrap.downloadPackage()}>{t('wrap.package.download')}</Button>{/if}
		{:else}
			<div class="line"><span>{size}</span></div>
			{#each warnings as w (w)}<p class="warn">{w}</p>{/each}
			{#if wrap.phase === 'failed'}<p class="warn" role="status">{t('wrap.package.failed')}</p>{/if}
			{#if wrap.phase === 'cancelled'}<p class="said" role="status">{t('wrap.package.cancelled')}</p>{/if}
			{#if wrap.readiness === 'noFiles'}<p class="said">{t('wrap.files.none')}</p>{/if}
			{#if wrap.readiness === 'noDays'}<p class="said">{t('wrap.days.none')}</p>{/if}
			<Button variant="filled" size="large" full disabled={blocked} onclick={make}>{t('wrap.package.make')}</Button>
			<p class="quiet">{t('wrap.package.offline')}</p>
		{/if}
	</div>
</Section>

<ActionSheet
	bind:open={confirm}
	title={t('wrap.size.confirm.title')}
	message={t('wrap.size.confirm.message', { size: formatBytes(plan?.bytes ?? 0) })}
	actions={[
		{ label: t('wrap.size.confirm.go'), run: () => void wrap.build() },
		{ label: t('common.cancel'), role: 'cancel', run: () => undefined }
	]}
/>

<style>
	.deliver {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px 16px;
	}
	.line {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 17px;
		line-height: 22px;
		color: var(--label);
	}
	.name {
		overflow-wrap: anywhere;
	}
	.num {
		color: var(--label-2);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--fill);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--tint-solid);
		transform-origin: left center;
		transition: transform 200ms linear;
	}
	.warn,
	.said,
	.quiet {
		margin: 0;
		font-size: 13px;
		line-height: 18px;
	}
	.warn {
		color: var(--warning);
	}
	.said {
		color: var(--label-2);
	}
	.quiet {
		color: var(--label-3);
		text-align: center;
	}
</style>
