<script lang="ts">
	// The gear library in a sheet: the camera bodies and lens sets the app ships with. Tick
	// bodies; open a lens set and tick the whole set or single lenses. Add makes the picked ones
	// records of the project, as one edit. What the project already has shows as such and cannot
	// be picked twice. The tables load when the sheet first opens.
	import { ChevronDown } from '@lucide/svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import SearchField from '$lib/components/ios/SearchField.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { t } from '$lib/i18n/messages';
	import {
		inProject,
		lensSeries,
		libraryAdds,
		parseLibraryCameras,
		parseLibraryLenses,
		searchLibraryCameras,
		searchSeries,
		type LensSeries,
		type LibraryCamera,
		type LibraryLens
	} from '$lib/gear/library';
	import type { GearScope } from '$lib/gear/names';
	import { libraryCameraLine, libraryLensLine, seriesLine } from '$lib/gear/text';
	import type { Camera, Lens } from '$lib/model/types';

	let {
		open = $bindable(false),
		scope = $bindable('camera'),
		projectId,
		cameras,
		lenses
	}: { open?: boolean; scope?: GearScope; projectId: string; cameras: Camera[]; lenses: Lens[] } = $props();

	const app = useApp();

	let data = $state.raw<{ cameras: LibraryCamera[]; series: LensSeries[] } | null>(null);
	$effect(() => {
		if (!open || data) return;
		void Promise.all([import('$lib/gear/library/cameras.csv?raw'), import('$lib/gear/library/lenses.csv?raw')]).then(([c, l]) => {
			data = { cameras: parseLibraryCameras(c.default), series: lensSeries(parseLibraryLenses(l.default)) };
		});
	});

	let query = $state('');
	let pickedCameras = $state.raw<ReadonlySet<LibraryCamera>>(new Set());
	let pickedLenses = $state.raw<ReadonlySet<LibraryLens>>(new Set());
	let openSet = $state<string | null>(null);
	let adding = $state(false);
	$effect(() => {
		if (open) return;
		query = '';
		pickedCameras = new Set();
		pickedLenses = new Set();
		openSet = null;
	});

	const shownCameras = $derived(data ? searchLibraryCameras(data.cameras, query) : []);
	const cameraMakes = $derived.by(() => {
		const makes = new Map<string, LibraryCamera[]>();
		for (const c of shownCameras) makes.set(c.make, [...(makes.get(c.make) ?? []), c]);
		return [...makes].map(([make, items]) => ({ make, items }));
	});
	const shownSeries = $derived(data ? searchSeries(data.series, query) : []);
	const count = $derived(pickedCameras.size + pickedLenses.size);

	const hasCamera = (c: LibraryCamera) => inProject('camera', c, cameras);
	const hasLens = (l: LibraryLens) => inProject('lens', l, lenses);
	const free = (s: LensSeries) => s.lenses.filter((l) => !hasLens(l));
	const pickedIn = (s: LensSeries) => s.lenses.filter((l) => pickedLenses.has(l)).length;

	function toggleCamera(c: LibraryCamera) {
		const next = new Set(pickedCameras);
		if (!next.delete(c)) next.add(c);
		pickedCameras = next;
	}
	function toggleLens(l: LibraryLens) {
		const next = new Set(pickedLenses);
		if (!next.delete(l)) next.add(l);
		pickedLenses = next;
	}
	function toggleSet(s: LensSeries) {
		const all = free(s);
		const next = new Set(pickedLenses);
		const whole = all.length > 0 && all.every((l) => next.has(l));
		for (const l of all) {
			if (whole) next.delete(l);
			else next.add(l);
		}
		pickedLenses = next;
	}

	async function add() {
		if (adding || count === 0) return;
		adding = true;
		try {
			const newCameras = libraryAdds('camera', [...pickedCameras], cameras, projectId, app.newId).records;
			const newLenses = libraryAdds('lens', [...pickedLenses], lenses, projectId, app.newId).records;
			const n = newCameras.length + newLenses.length;
			if (n > 0) {
				await app.edit.group({ key: n === 1 ? 'gear.library.added.one' : 'gear.library.added.many', params: { n } }, async () => {
					for (const record of newCameras) await app.edit.create('camera', record);
					for (const record of newLenses) await app.edit.create('lens', record);
				});
			}
			open = false;
		} finally {
			adding = false;
		}
	}

	const kinds = [
		{ value: 'camera', label: t('gear.cameras') },
		{ value: 'lens', label: t('gear.lenses') }
	];
</script>

<Sheet bind:open title={t('gear.library.title')}>
	{#snippet leading()}<Button variant="plain" onclick={() => (open = false)}>{t('common.cancel')}</Button>{/snippet}
	{#snippet trailing()}
		<Button variant="plain" class="strong" onclick={add} disabled={count === 0 || adding}>{count ? t('gear.library.add.n', { n: count }) : t('gear.add')}</Button>
	{/snippet}
	<div class="library">
		<div class="kind"><Segmented options={kinds} value={scope} onchange={(v) => (scope = v as GearScope)} label={t('gear.library.kind')} /></div>
		<div class="search">
			<SearchField bind:value={query} placeholder={t(scope === 'camera' ? 'gear.library.search.camera' : 'gear.library.search.lens')} label={t(scope === 'camera' ? 'gear.library.search.camera' : 'gear.library.search.lens')} />
		</div>

		{#if !data}
			<Section><Row title={t('common.loading')} class="quiet" /></Section>
		{:else if scope === 'camera'}
			{#each cameraMakes as group (group.make)}
				<Section header={group.make}>
					{#each group.items as c (c.model)}
						{#if hasCamera(c)}
							<Row title={c.model} subtitle={libraryCameraLine(c) || undefined} detail={t('gear.library.have')} class="quiet" />
						{:else}
							<Row title={c.model} subtitle={libraryCameraLine(c) || undefined} checked={pickedCameras.has(c)} onclick={() => toggleCamera(c)} />
						{/if}
					{/each}
				</Section>
			{:else}
				<Section><Row title={t('gear.library.none', { query: query.trim() })} class="quiet" /></Section>
			{/each}
			{#if cameraMakes.length}<p class="foot">{t('gear.library.footer.camera')}</p>{/if}
		{:else}
			{#each shownSeries as s (s.key)}
				{@const isOpen = openSet === s.key}
				{@const n = pickedIn(s)}
				{@const all = free(s)}
				<Section>
					<Row title="{s.make} {s.series}" subtitle={seriesLine(s)} detail={n ? t('gear.library.picked', { n }) : undefined} onclick={() => (openSet = isOpen ? null : s.key)}>
						{#snippet trailing()}<span class="chev" class:open={isOpen} aria-hidden="true"><ChevronDown class="size-[18px]" strokeWidth={2.4} /></span>{/snippet}
					</Row>
					{#if isOpen}
						{#if all.length > 1}
							<Row title={t('gear.library.wholeSet', { n: all.length })} class="tint" checked={all.every((l) => pickedLenses.has(l))} onclick={() => toggleSet(s)} />
						{/if}
						{#each s.lenses as l (l.model)}
							{#if hasLens(l)}
								<Row title={l.model} subtitle={libraryLensLine(l) || undefined} detail={t('gear.library.have')} class="quiet" />
							{:else}
								<Row title={l.model} subtitle={libraryLensLine(l) || undefined} checked={pickedLenses.has(l)} onclick={() => toggleLens(l)} />
							{/if}
						{/each}
					{/if}
				</Section>
			{:else}
				<Section><Row title={t('gear.library.none', { query: query.trim() })} class="quiet" /></Section>
			{/each}
			{#if shownSeries.length}<p class="foot">{t('gear.library.footer.lens')}</p>{/if}
		{/if}
	</div>
</Sheet>

<style>
	.library {
		padding: 8px 0 24px;
	}
	.kind {
		padding: 0 var(--page-margin, 16px) 10px;
	}
	.search {
		padding: 0 calc(var(--page-margin, 16px) - 16px) 8px;
	}
	.chev {
		display: inline-flex;
		color: var(--label-3);
		transition: transform var(--dur-control, 0.25s) var(--ease-ios);
	}
	.chev.open {
		transform: rotate(180deg);
	}
	:global(html[data-motion='reduced']) .chev {
		transition: none;
	}
	.foot {
		padding: 4px calc(var(--page-margin, 16px) + 16px) 0;
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
</style>
