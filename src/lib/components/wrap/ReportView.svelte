<script lang="ts">
	// The printable day report: the paper on screen, Print opens the print dialog (Save as PDF is
	// there too). Which days and takes come from the address: `?days=<id>,<id>&circled=1&ng=0`.
	// For print a copy of the report goes straight under <body>, and everything else is hidden: the
	// shell's scrolling frame would cut the pages off. Black on white in every appearance.
	import { Printer } from '@lucide/svelte';
	import { page } from '$app/state';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { t } from '$lib/i18n/messages';
	import { defaultChoice } from '$lib/wrap/choice';
	import { reportCss, type Paper } from '$lib/wrap/report';
	import { Wrap } from '$lib/wrap/wrap.svelte';

	const current = useCurrent();
	const wrap = new Wrap(useApp(), current);

	$effect(() => {
		const q = page.url.searchParams;
		const days = (q.get('days') ?? '').split(',').filter(Boolean);
		wrap.choice = { ...defaultChoice(), span: 'days', dayIds: days.length ? days : current.shootDay ? [current.shootDay.id] : [], circledOnly: q.get('circled') === '1', excludeNoGood: q.get('ng') === '0', files: ['report'] };
	});

	let paper = $state<Paper>(wrap.paper);
	const papers = [
		{ value: 'a4', label: t('wrap.report.a4') },
		{ value: 'letter', label: t('wrap.report.letter') }
	];
	// The paper fits the room on screen: a phone sees the whole width, smaller.
	let room = $state(0);
	const paperWidth = $derived(paper === 'a4' ? 794 : 816);
	const fit = $derived(room ? Math.min(1, room / paperWidth) : 1);
	const css = $derived(`<style>${reportCss(paper)}</style>`);

	/** Moves the node under <body>, where print sees it whole. */
	function toBody(node: HTMLElement) {
		document.body.append(node);
		return { destroy: () => node.remove() };
	}
</script>

<svelte:head>
	<title>{t('wrap.report.title')} · {t('app.name')}</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html css}
</svelte:head>

<Page width="full">
	<NavBar title={t('wrap.report.title')} back={{ href: '/wrap', label: t('wrap.report.back') }} />
	<div class="bar">
		<Segmented small options={papers} value={paper} onchange={(v) => (paper = v as Paper)} label={t('wrap.report.paper')} />
		<Button variant="filled" onclick={() => window.print()}><Printer class="size-[18px]" strokeWidth={2.2} aria-hidden="true" />{t('wrap.report.print')}</Button>
	</div>
	<p class="hint">{t('wrap.report.footer')}</p>
	{#if wrap.ready && wrap.reportBodyHtml}
		<div class="desk" bind:clientWidth={room}>
			<div class="paper {paper}" style:zoom={fit < 1 ? fit : undefined}>
				<!-- Escaped in wrap/report.ts: every typed value. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div class="wrap-report">{@html wrap.reportBodyHtml}</div>
			</div>
		</div>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<div class="wrap-report wrap-print" use:toBody>{@html wrap.reportBodyHtml}</div>
	{:else if wrap.ready}
		<EmptyState title={t('wrap.report.none')} />
	{/if}
</Page>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		padding: 4px var(--page-margin, 16px) 0;
	}
	.bar :global(.ios-seg) {
		width: 200px;
	}
	.hint {
		margin: 8px var(--page-margin, 16px) 16px;
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
	.desk {
		overflow-x: auto;
		margin: 0 var(--page-margin, 16px);
		padding-bottom: 32px;
	}
	.paper {
		/* The sheet as printed: 210 or 216 mm wide, its margins inside. */
		width: 794px;
		min-width: 794px;
		margin: 0 auto;
		padding: 45px 42px 50px;
		background: #fff;
		box-shadow: var(--shadow-2);
		border-radius: 4px;
	}
	.paper.letter {
		width: 816px;
		min-width: 816px;
	}
	/* Red night: the paper on screen goes red on black, so the set stays dark. Print is untouched. */
	:global([data-night='true']) .paper {
		background: var(--cell);
		box-shadow: none;
		outline: var(--hairline) solid var(--separator);
	}
	:global([data-night='true']) .paper :global(.wrap-report),
	:global([data-night='true']) .paper :global(.wrap-report *) {
		background: transparent !important;
		color: var(--label) !important;
		border-color: var(--separator-opaque) !important;
	}
	:global([data-night='true']) .paper :global(.wrap-report .take) {
		border-color: transparent !important;
	}
	:global([data-night='true']) .paper :global(tr.circled .take) {
		border-color: var(--label) !important;
	}
	.wrap-print {
		display: none;
	}
	@media print {
		:global(body > *:not(.wrap-print)) {
			display: none !important;
		}
		:global(body > .wrap-print) {
			display: block !important;
		}
		:global(html),
		:global(body) {
			background: #fff !important;
			height: auto !important;
			overflow: visible !important;
		}
	}
</style>
