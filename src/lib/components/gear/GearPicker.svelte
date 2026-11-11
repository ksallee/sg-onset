<script lang="ts">
	// The camera or the lens of a camera setup, in one tap: recent first (picked this session,
	// then the gear of the latest takes), then the rest; lenses as primes and zooms. The current
	// one has the checkmark. A pick saves at once and closes. Takes already shot keep theirs.
	import Row from '$lib/components/ios/Row.svelte';
	import SearchField from '$lib/components/ios/SearchField.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { t } from '$lib/i18n/messages';
	import { searchCameras, searchLenses, sortCameras, sortLenses } from '$lib/gear/list';
	import { cameraTitle, lensKind, lensTitle } from '$lib/gear/names';
	import { picks } from '$lib/gear/picks.svelte';
	import { pickerList, recentIds } from '$lib/gear/setups';
	import { cameraLine, lensLine } from '$lib/gear/text';
	import type { Camera, CameraSetup, Lens, Take } from '$lib/model/types';

	let {
		open = $bindable(false),
		kind,
		setup,
		cameras,
		lenses,
		takes,
		onpick
	}: {
		open?: boolean;
		kind: 'camera' | 'lens';
		setup: CameraSetup | undefined;
		cameras: Camera[];
		lenses: Lens[];
		takes: Take[];
		onpick: (id: string | undefined) => void;
	} = $props();

	/** Past this many, a search field. */
	const SEARCH_FROM = 8;
	const RECENT = 4;

	let query = $state('');
	$effect(() => {
		if (!open) query = '';
	});

	const key = $derived(kind === 'camera' ? 'cameraId' : 'lensId');
	const current = $derived(setup?.[key]);
	const all = $derived<(Camera | Lens)[]>(kind === 'camera' ? sortCameras(cameras) : sortLenses(lenses));
	const found = $derived<(Camera | Lens)[]>(
		kind === 'camera' ? searchCameras(all as Camera[], query) : searchLenses(all as Lens[], query, { prime: t('gear.kind.prime'), zoom: t('gear.kind.zoom') })
	);
	const recent = $derived(recentIds(takes, key, picks[key]));
	const groups = $derived.by(() => {
		const split = pickerList(found, query ? [] : recent, RECENT);
		const out: { header?: string; items: (Camera | Lens)[] }[] = [];
		if (split.recent.length) out.push({ header: t('gear.picker.recent'), items: split.recent });
		if (kind === 'camera') out.push({ header: split.recent.length ? t('gear.picker.all.camera') : undefined, items: split.rest });
		else {
			const of = (k: string) => split.rest.filter((l) => lensKind(l as Lens) === k);
			out.push({ header: t('gear.picker.primes'), items: of('prime') }, { header: t('gear.picker.zooms'), items: of('zoom') }, { header: t('gear.picker.other'), items: of('unknown') });
		}
		return out.filter((g) => g.items.length);
	});
	const title = (item: Camera | Lens) => (kind === 'camera' ? cameraTitle(item as Camera) : lensTitle(item as Lens)) || t('gear.untitled');
	const line = (item: Camera | Lens) => (kind === 'camera' ? cameraLine(item as Camera) : lensLine(item as Lens)) || undefined;

	function pick(id: string | undefined) {
		if (id) picks.add(key, id);
		onpick(id);
		open = false;
	}
</script>

<Sheet bind:open title={t(kind === 'camera' ? 'gear.picker.camera' : 'gear.picker.lens', { setup: setup?.cameraLabel ?? '' })} detents={['large']} done>
	<div class="picker">
		{#if all.length > SEARCH_FROM}
			<div class="search"><SearchField bind:value={query} placeholder={t(kind === 'camera' ? 'gear.picker.search.camera' : 'gear.picker.search.lens')} /></div>
		{/if}
		{#if all.length === 0}
			<Section footer={t('gear.setup.takes')}>
				<Row title={t(kind === 'camera' ? 'gear.picker.none.camera' : 'gear.picker.none.lens')} class="quiet" />
			</Section>
		{:else}
			{#each groups as group, i (group.header ?? i)}
				<Section header={group.header}>
					{#each group.items as item (item.id)}
						<Row title={title(item)} subtitle={line(item)} checked={item.id === current} onclick={() => pick(item.id)} />
					{/each}
				</Section>
			{/each}
			{#if query && found.length === 0}
				<Section><Row title={t('gear.search.none', { query })} class="quiet" /></Section>
			{/if}
			<Section footer={t('gear.setup.takes')}>
				<Row title={t('gear.setup.none')} checked={current === undefined} onclick={() => pick(undefined)} />
			</Section>
		{/if}
	</div>
</Sheet>

<style>
	.picker {
		padding-bottom: 24px;
	}
	.search {
		padding: 4px 16px 8px;
	}
</style>
