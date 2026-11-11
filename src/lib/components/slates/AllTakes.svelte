<script lang="ts">
	// Every take of the current shoot day in one table, across its slates, to select many and edit
	// them at once. Filters: slate, camera setup, the time of day a take started. The selection
	// keeps takes the filters hide; the bar counts what is in view and bulk edit acts on it.
	import { Rows3 } from '@lucide/svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { live } from '$lib/app/live.svelte';
	import { t } from '$lib/i18n/messages';
	import type { Take } from '$lib/model/types';
	import { clearSelection, EMPTY_SELECTION, isAllSelected, pruneSelection, selectAll, selectedIn } from '$lib/slates/selection';
	import { dayTakeLines, filterTakeLines, formatClock, parseClock, setupOptions, type Clock } from '$lib/slates/takes';
	import BulkSheet from './BulkSheet.svelte';
	import { provideRefs } from './refs.svelte';
	import SelectionBar from './SelectionBar.svelte';
	import TakeSheet from './TakeSheet.svelte';
	import TakeTable from './TakeTable.svelte';

	const current = useCurrent();
	const refs = provideRefs();
	const takes = live<Take[]>(
		['take'],
		async (store) => {
			const slates = current.slates;
			return (await Promise.all(slates.map((s) => store.list('take', s.id)))).flat();
		},
		[]
	);

	let slateId = $state('');
	let setupId = $state('');
	let fromText = $state('');
	let toText = $state('');
	const from = $derived(parseClock(fromText));
	const to = $derived(parseClock(toText));
	const clock = (c: Clock | undefined | null) => (c === null ? undefined : c);

	const lines = $derived(dayTakeLines(current.slates, takes.value, refs.setups, refs.lenses));
	const shown = $derived(
		filterTakeLines(lines, {
			slateIds: slateId ? new Set([slateId]) : undefined,
			setupIds: setupId ? new Set([setupId]) : undefined,
			from: clock(from),
			to: clock(to)
		})
	);
	const setups = $derived(setupOptions(takes.value, refs.setups));
	const order = $derived(shown.map((l) => l.take.id));

	let selection = $state(EMPTY_SELECTION);
	let range = $state(false);
	let bulkOpen = $state(false);
	let takeOpen = $state(false);
	let takeId = $state<string | undefined>();
	$effect(() => {
		const next = pruneSelection(
			selection,
			takes.value.map((tk) => tk.id)
		);
		if (next !== selection) selection = next;
	});
	const ids = $derived(selectedIn(selection, order));
	const dayLabel = $derived(current.shootDay ? t('context.day', { n: current.shootDay.shootDay ?? 0 }) : '');
	const tidy = (text: string, c: Clock | undefined | null) => (c === undefined || c === null ? text : formatClock(c));
</script>

<Page width="full">
	<NavBar title={t('slates.all.title')} large back={{ href: '/slates', label: t('slates.title') }} />
	<ContextBar />
	<div class="filters" role="group" aria-label={t('slates.filter')}>
		<label class="filter">
			<span>{t('slates.all.filter.slate')}</span>
			<select bind:value={slateId}>
				<option value="">{t('slates.all.filter.slate.all')}</option>
				{#each current.slates as s (s.id)}<option value={s.id}>{s.slateUID}</option>{/each}
			</select>
		</label>
		<label class="filter">
			<span>{t('slates.all.filter.setup')}</span>
			<select bind:value={setupId}>
				<option value="">{t('slates.all.filter.setup.all')}</option>
				{#each setups as s (s.id)}<option value={s.id}>{s.cameraLabel}</option>{/each}
			</select>
		</label>
		<label class="filter" class:bad={from === null}>
			<span>{t('slates.all.filter.from')}</span>
			<input type="text" inputmode="numeric" placeholder={t('slates.all.filter.time')} bind:value={fromText} onblur={() => (fromText = tidy(fromText, from))} aria-invalid={from === null || undefined} />
		</label>
		<label class="filter" class:bad={to === null}>
			<span>{t('slates.all.filter.to')}</span>
			<input type="text" inputmode="numeric" placeholder={t('slates.all.filter.time')} bind:value={toText} onblur={() => (toText = tidy(toText, to))} aria-invalid={to === null || undefined} />
		</label>
	</div>
	{#if from === null || to === null}<p class="note bad" role="alert">{t('slates.all.filter.badTime')}</p>{/if}
	<p class="note">{t('slates.all.count', { shown: shown.length, all: lines.length })}{dayLabel ? ` · ${dayLabel}` : ''}</p>

	{#if shown.length}
		<TakeTable
			lines={shown}
			showSlate
			bind:selection
			bind:range
			label={t('slates.all.title')}
			onopen={(tk) => {
				takeId = tk.id;
				takeOpen = true;
			}}
		/>
		<p class="note">{t('slates.select.hint')}</p>
		<div style:height={ids.length ? '140px' : '0px'} aria-hidden="true"></div>
	{:else if takes.ready}
		<EmptyState icon={Rows3} title={t('slates.all.none')} message={t('slates.all.none.message')} />
	{/if}

	{#snippet accessory()}
		<SelectionBar
			count={ids.length}
			all={isAllSelected(selection, order)}
			bind:range
			onall={() => (selection = selectAll(selection, order))}
			onnone={() => (selection = clearSelection(selection, order))}
			onedit={() => (bulkOpen = true)}
			ondone={() => {
				selection = EMPTY_SELECTION;
				range = false;
			}}
		/>
	{/snippet}
</Page>

<BulkSheet bind:open={bulkOpen} takes={takes.value} {ids} />
<TakeSheet bind:open={takeOpen} id={takeId} />

<style>
	.filters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 8px;
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 8px;
	}
	.filter {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-height: 56px;
		padding: 6px 14px;
		border-radius: 12px;
		background: var(--cell);
	}
	.filter span {
		font-size: 12px;
		line-height: 16px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--label-2);
	}
	.filter select,
	.filter input {
		min-height: 30px;
		background: transparent;
		color: var(--tint);
		font-size: 17px;
		outline: none;
		appearance: none;
		-webkit-appearance: none;
	}
	.filter input::placeholder {
		color: var(--label-3);
	}
	.filter:focus-within span {
		color: var(--tint);
	}
	.filter.bad span,
	.note.bad {
		color: var(--destructive);
	}
	.note {
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		margin-block: 8px;
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
</style>
