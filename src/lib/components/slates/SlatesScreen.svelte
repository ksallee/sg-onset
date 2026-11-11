<script lang="ts">
	// The Slates destination. With room (an iPad in landscape), the current day's slates on one
	// side and the picked slate beside them; picking another swaps the detail in place and keeps
	// the address in step, without a push. With less, the list and the slate are two pages, the
	// slate pushed over the list. The selection of takes, its bar and bulk edit live here so the
	// bar can sit on the holding hand's edge of the whole screen.
	import { CircleAlert, Clapperboard, ListFilter, Plus, Rows3 } from '@lucide/svelte';
	import { replaceState } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import Menu from '$lib/components/ios/Menu.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatTime } from '$lib/app/format';
	import { live, liveList, liveQueue } from '$lib/app/live.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import type { Slate, Take } from '$lib/model/types';
	import { filterSlates, sceneOptions, SLATE_SORTS, sortSlateRows, summarise, takeCount, unsyncedSlateIds, type SlateFilter, type SlateSort, type SlateSummary } from '$lib/slates/list';
	import { clearSelection, EMPTY_SELECTION, isAllSelected, pruneSelection, selectAll, selectedIn } from '$lib/slates/selection';
	import BulkSheet from './BulkSheet.svelte';
	import NewSlateSheet from './NewSlateSheet.svelte';
	import { provideRefs } from './refs.svelte';
	import SelectionBar from './SelectionBar.svelte';
	import SlateDetail from './SlateDetail.svelte';
	import TakeSheet from './TakeSheet.svelte';

	let { id }: { id?: string } = $props();

	const app = useApp();
	const current = useCurrent();
	provideRefs();

	// Room: the split from 880 px of page. A first guess from the window, so it does not flash.
	let width = $state(typeof window === 'undefined' ? 0 : window.innerWidth - 248);
	const wide = $derived(width >= 880);

	// The day's slates, their takes and what is not yet synced, live.
	const dayTakes = live<Take[]>(
		['take'],
		async (store) => {
			const slates = current.slates;
			return (await Promise.all(slates.map((s) => store.list('take', s.id)))).flat();
		},
		[]
	);
	const queue = liveQueue();
	const unsynced = $derived(unsyncedSlateIds(queue.value, dayTakes.value));
	let sort = $state<SlateSort>('slate');
	let filter = $state<SlateFilter>({});
	const all = $derived(summarise(current.slates, dayTakes.value, unsynced));
	const rows = $derived(sortSlateRows(filterSlates(all, filter), sort));
	const scenes = $derived(sceneOptions(current.slates));
	const filtering = $derived(filter.scene !== undefined || !!filter.noGood || !!filter.unsynced);

	// The slate shown: the address's, else on a wide screen the one being shot or the first.
	// svelte-ignore state_referenced_locally
	let picked = $state<string | undefined>(id);
	$effect.pre(() => {
		picked = id;
	});
	const shown = $derived(picked ?? (wide ? (current.slate?.id ?? rows[0]?.slate.id) : undefined));
	function open(e: MouseEvent, slate: Slate) {
		if (!wide) return;
		e.preventDefault();
		picked = slate.id;
		replaceState(`/slates/${slate.id}`, {});
	}

	// The selection of takes of the slate shown, its bar and bulk edit.
	const slateTakes = liveList('take', () => shown);
	let selection = $state(EMPTY_SELECTION);
	let range = $state(false);
	let bulkOpen = $state(false);
	let takeOpen = $state(false);
	let takeId = $state<string | undefined>();
	const order = $derived(slateTakes.value.map((tk) => tk.id));
	$effect(() => {
		void shown;
		selection = EMPTY_SELECTION;
		range = false;
	});
	$effect(() => {
		const next = pruneSelection(selection, order);
		if (next !== selection) selection = next;
	});
	const ids = $derived(selectedIn(selection, order));

	let creating = $state(false);
	const count = (n: number) => {
		const c = takeCount(n);
		return t(c.key, c.params);
	};
	const sub = (r: SlateSummary) =>
		[r.slate.sceneNumber ? t('slates.scene', { scene: r.slate.sceneNumber }) : '', r.start ? t('slates.time', { start: formatTime(r.start), end: formatTime(r.end) }) : '', wide ? '' : r.slate.description].filter(Boolean).join(' · ');
	const sceneItems = $derived([
		{ label: t('slates.filter.scene.all'), run: () => (filter = { ...filter, scene: undefined }) },
		...scenes.map((s, i) => ({ label: t('slates.scene', { scene: s }), section: i === 0, run: () => (filter = { ...filter, scene: s }) }))
	]);
</script>

{#snippet list()}
	<Page>
		<NavBar title={t('slates.title')} large>
			{#snippet trailing()}
				<Button variant="plain" onclick={() => (creating = true)} disabled={!current.shootDay}><Plus class="size-[20px]" strokeWidth={2.2} />{t('slates.new')}</Button>
			{/snippet}
		</NavBar>
		<ContextBar />
		{#if !current.shootDay}
			<EmptyState icon={Clapperboard} title={t('slates.noDay')} message={t('slates.noDay.message')} />
		{:else if all.length === 0 && dayTakes.ready}
			<EmptyState icon={Clapperboard} title={t('slates.empty')} message={t('slates.empty.message')}>
				{#snippet action()}<Button variant="filled" onclick={() => (creating = true)}>{t('slates.new')}</Button>{/snippet}
			</EmptyState>
		{:else}
			<Section>
				<Row title={t('slates.allTakes')} detail={count(dayTakes.value.length)} href="/slates/takes">
					{#snippet leading()}<Tile icon={Rows3} color="var(--tint)" />{/snippet}
				</Row>
			</Section>
			<div class="tools">
				<Segmented small label={t('slates.sort')} options={SLATE_SORTS.map((s) => ({ value: s, label: tk(`slates.sort.${s}`) }))} value={sort} onchange={(v) => (sort = v as SlateSort)} />
				<div class="chips" role="group" aria-label={t('slates.filter')}>
					<Menu items={sceneItems} align="start">
						{#snippet trigger(props)}<button {...props} class="chip" class:on={filter.scene !== undefined}><ListFilter class="size-[15px]" />{filter.scene !== undefined ? t('slates.scene', { scene: filter.scene }) : t('slates.filter.scene.all')}</button>{/snippet}
					</Menu>
					<button type="button" class="chip" class:on={filter.noGood} aria-pressed={!!filter.noGood} onclick={() => (filter = { ...filter, noGood: !filter.noGood })}>{t('slates.filter.noGood')}</button>
					<button type="button" class="chip" class:on={filter.unsynced} aria-pressed={!!filter.unsynced} onclick={() => (filter = { ...filter, unsynced: !filter.unsynced })}>{t('slates.filter.unsynced')}</button>
				</div>
			</div>
			<Section>
				{#each rows as r (r.slate.id)}
					<Row
						title={r.slate.slateUID ?? ''}
						subtitle={sub(r) || undefined}
						detail={count(r.takes)}
						href="/slates/{r.slate.id}"
						class={wide && r.slate.id === shown ? 'picked' : ''}
						onclick={(e) => open(e, r.slate)}
						swipe={[{ label: t('common.delete'), destructive: true, run: () => app.edit.removeTree('slate', r.slate.id, { key: 'edit.removed', params: { what: t('slates.slate', { slate: r.slate.slateUID ?? '' }) } }) }]}
					>
						{#snippet trailing()}
							<span class="marks" aria-hidden={r.circled + r.noGood === 0 && !r.unsynced}>
								{#if r.circled}<span class="mark circled">{t('slates.circled', { n: r.circled })}</span>{/if}
								{#if r.noGood}<span class="mark ng">{t('slates.noGood', { n: r.noGood })}</span>{/if}
								{#if r.unsynced}<span class="sync" title={t('slates.unsynced')}><CircleAlert class="size-[15px]" /><span class="sr-only">{t('slates.unsynced')}</span></span>{/if}
							</span>
						{/snippet}
					</Row>
				{:else}
					<Row title={t('slates.empty.filter')} class="quiet" />
					{#if filtering}<Row title={t('slates.filter.clear')} class="tint" onclick={() => (filter = {})} />{/if}
				{/each}
			</Section>
		{/if}
	</Page>
{/snippet}

{#snippet detail(back: boolean)}
	{#if shown}
		<SlateDetail
			id={shown}
			takes={slateTakes.value}
			{back}
			bind:selection
			bind:range
			onopen={(tk) => {
				takeId = tk.id;
				takeOpen = true;
			}}
		/>
	{:else}
		<Page>
			<NavBar title="" />
			<EmptyState icon={Clapperboard} title={t('slates.pick')} message={t('slates.pick.message')} />
		</Page>
	{/if}
{/snippet}

<div class="screen" class:wide class:selecting={ids.length > 0} bind:clientWidth={width}>
	{#if wide}
		<div class="list-pane" data-page-pin>{@render list()}</div>
		<div class="detail-pane">{@render detail(false)}</div>
	{:else if id}
		{@render detail(true)}
	{:else}
		{@render list()}
	{/if}
	<div class="bar">
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
	</div>
</div>

<NewSlateSheet bind:open={creating} />
<BulkSheet bind:open={bulkOpen} takes={slateTakes.value} {ids} />
<TakeSheet bind:open={takeOpen} id={takeId} />

<style>
	.screen {
		position: relative;
		height: var(--app-height, 100dvh);
	}
	.screen.wide {
		display: flex;
	}
	.screen.selecting {
		--select-space: 140px;
	}
	.list-pane {
		flex: none;
		width: clamp(320px, 36%, 400px);
		box-shadow: var(--hairline) 0 0 var(--separator);
		z-index: 1;
	}
	.detail-pane {
		flex: 1;
		min-width: 0;
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
	}
	.tools {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 0 var(--page-margin, 16px);
		margin-block: 4px 12px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 0 14px;
		border-radius: 18px;
		background: var(--fill-3);
		color: var(--label);
		font-size: 15px;
		transition: background-color var(--dur-press);
		position: relative;
	}
	.chip::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}
	.chip.on {
		background: var(--tint);
		color: var(--on-tint);
	}
	.marks {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-right: 6px;
	}
	.mark {
		padding: 1px 7px;
		border-radius: 9px;
		font-size: 12px;
		line-height: 18px;
		font-weight: 600;
		white-space: nowrap;
	}
	.mark.circled {
		box-shadow: inset 0 0 0 1.5px var(--tint);
		color: var(--tint);
	}
	.mark.ng {
		background: color-mix(in srgb, var(--destructive) 16%, transparent);
		color: var(--destructive);
	}
	.sync {
		display: inline-flex;
		color: var(--changed);
	}
	:global(.ios-row.picked) {
		--group-bg: color-mix(in srgb, var(--tint) 14%, var(--cell));
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
