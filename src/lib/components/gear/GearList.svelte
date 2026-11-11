<script lang="ts">
	// The gear of the project as one list: camera setups first (they change all day), then
	// cameras, then lenses. A search finds across the three. Each section ends with its Add row;
	// cameras and lenses also with Import.
	import { Camera as CameraIcon, FileUp, Plus } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import SearchField from '$lib/components/ios/SearchField.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import { t } from '$lib/i18n/messages';
	import { searchCameras, searchLenses, searchSetups } from '$lib/gear/list';
	import { cameraTitle, lensTitle, type GearScope } from '$lib/gear/names';
	import type { Selection } from '$lib/gear/records';
	import { cameraLine, focalBadge, focalText, lensLine } from '$lib/gear/text';
	import type { Camera, CameraSetup, Lens } from '$lib/model/types';
	import SetupRow from './SetupRow.svelte';

	let {
		cameras,
		lenses,
		setups,
		query = $bindable(''),
		selection,
		wide,
		onselect,
		onlens,
		onadd,
		onimport
	}: {
		cameras: Camera[];
		lenses: Lens[];
		setups: CameraSetup[];
		query?: string;
		selection: Selection | undefined;
		wide: boolean;
		onselect: (selection: Selection) => void;
		onlens: (setup: CameraSetup) => void;
		onadd: (scope: GearScope | 'cameraSetup') => void;
		onimport: (scope: GearScope) => void;
	} = $props();

	const kinds = { prime: t('gear.kind.prime'), zoom: t('gear.kind.zoom') };
	const shownSetups = $derived(searchSetups(setups, cameras, lenses, query));
	const shownCameras = $derived(searchCameras(cameras, query));
	const shownLenses = $derived(searchLenses(lenses, query, kinds));
	const searching = $derived(query.trim() !== '');
	const nothing = $derived(searching && shownSetups.length + shownCameras.length + shownLenses.length === 0);

	const isSel = (scope: Selection['scope'], id: string) => wide && selection?.scope === scope && selection.id === id;
	const header = (name: string, shown: number, total: number) => t('gear.section', { name, n: searching ? `${shown}/${total}` : total });
	const cameraName = (setup: CameraSetup) => {
		const body = cameras.find((c) => c.id === setup.cameraId);
		return body ? cameraTitle(body) || t('gear.untitled') : t('gear.setup.noCamera');
	};
	const lensName = (setup: CameraSetup) => {
		const lens = lenses.find((l) => l.id === setup.lensId);
		return lens ? lensTitle(lens) || t('gear.untitled') : t('gear.setup.noLens');
	};
	const lensShort = (setup: CameraSetup) => {
		const lens = lenses.find((l) => l.id === setup.lensId);
		return lens ? focalText(lens) || lensTitle(lens) : '';
	};
</script>

<div class="search"><SearchField bind:value={query} placeholder={t('gear.search')} label={t('gear.search')} /></div>

{#if nothing}
	<Section><Row title={t('gear.search.none', { query: query.trim() })} class="quiet" /></Section>
{:else}
	{#if !searching || shownSetups.length}
		<Section header={header(t('gear.setups'), shownSetups.length, setups.length)}>
			{#each shownSetups as setup (setup.id)}
				<SetupRow
					label={setup.cameraLabel ?? ''}
					line={cameraName(setup)}
					lensName={lensName(setup)}
					lens={lensShort(setup)}
					selected={isSel('cameraSetup', setup.id)}
					chevron={!wide}
					onopen={() => onselect({ scope: 'cameraSetup', id: setup.id })}
					onlens={() => onlens(setup)}
				/>
			{:else}
				<Row title={t('gear.none.cameraSetup')} class="quiet" />
			{/each}
			{#if !searching}
				<Row title={t('gear.add.cameraSetup')} class="tint" onclick={() => onadd('cameraSetup')}>
					{#snippet leading()}<span class="add" aria-hidden="true"><Plus class="size-[18px]" strokeWidth={2.4} /></span>{/snippet}
				</Row>
			{/if}
		</Section>
	{/if}

	{#if !searching || shownCameras.length}
		<Section header={header(t('gear.cameras'), shownCameras.length, cameras.length)}>
			{#each shownCameras as camera (camera.id)}
				<Row
					title={cameraTitle(camera) || t('gear.untitled')}
					subtitle={cameraLine(camera) || undefined}
					chevron={!wide}
					class={isSel('camera', camera.id) ? 'gear-selected' : ''}
					onclick={() => onselect({ scope: 'camera', id: camera.id })}
				>
					{#snippet leading()}<Tile icon={CameraIcon} color="var(--label-2)" />{/snippet}
				</Row>
			{:else}
				<Row title={t('gear.none.camera')} class="quiet" />
			{/each}
			{#if !searching}
				<Row title={t('gear.add.camera')} class="tint" onclick={() => onadd('camera')}>
					{#snippet leading()}<span class="add" aria-hidden="true"><Plus class="size-[18px]" strokeWidth={2.4} /></span>{/snippet}
				</Row>
				<Row title={t('gear.import.camera')} class="tint" onclick={() => onimport('camera')}>
					{#snippet leading()}<span class="add" aria-hidden="true"><FileUp class="size-[17px]" strokeWidth={2.2} /></span>{/snippet}
				</Row>
			{/if}
		</Section>
	{/if}

	{#if !searching || shownLenses.length}
		<Section header={header(t('gear.lenses'), shownLenses.length, lenses.length)}>
			{#each shownLenses as lens (lens.id)}
				<Row
					title={lensTitle(lens) || t('gear.untitled')}
					subtitle={lensLine(lens)}
					chevron={!wide}
					class={isSel('lens', lens.id) ? 'gear-selected' : ''}
					onclick={() => onselect({ scope: 'lens', id: lens.id })}
				>
					{#snippet leading()}<span class="focal num" class:zoom={lens.focalLengthMax !== undefined && lens.focalLengthMax !== lens.focalLength} aria-hidden="true">{focalBadge(lens)}</span>{/snippet}
				</Row>
			{:else}
				<Row title={t('gear.none.lens')} class="quiet" />
			{/each}
			{#if !searching}
				<Row title={t('gear.add.lens')} class="tint" onclick={() => onadd('lens')}>
					{#snippet leading()}<span class="add" aria-hidden="true"><Plus class="size-[18px]" strokeWidth={2.4} /></span>{/snippet}
				</Row>
				<Row title={t('gear.import.lens')} class="tint" onclick={() => onimport('lens')}>
					{#snippet leading()}<span class="add" aria-hidden="true"><FileUp class="size-[17px]" strokeWidth={2.2} /></span>{/snippet}
				</Row>
			{/if}
		</Section>
	{/if}
{/if}

<style>
	/* The field pads itself 16 px: line it up with the sections. */
	.search {
		padding: 0 calc(var(--page-margin, 16px) - 16px) 8px;
	}
	.add {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 29px;
		height: 29px;
		color: var(--tint);
	}
	.focal {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 58px;
		height: 29px;
		border-radius: 7px;
		background: var(--fill-2);
		color: var(--label);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: -0.2px;
	}
	.focal.zoom {
		background: var(--tint-fill);
		box-shadow: inset 0 0 0 var(--status-ring) var(--tint);
		color: var(--tint);
	}
	:global(.ios-row.gear-selected) {
		background: var(--selection);
		box-shadow: inset 0 0 0 var(--state-ring) var(--tint);
	}
</style>
