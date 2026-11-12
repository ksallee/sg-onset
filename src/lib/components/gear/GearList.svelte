<script lang="ts">
	// The gear of the project as one list: camera setups first (they change all day), then
	// cameras, then lenses. A search finds across the three. Each section ends with its Add row;
	// cameras and lenses also with the library and Import. Out of a search, setups move by the grip on each row:
	// drag it, or the up and down arrow keys on it. One move is one edit.
	import { tick } from 'svelte';
	import { Camera as CameraIcon, FileUp, LibraryBig, Plus } from '@lucide/svelte';
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
		onimport,
		onlibrary,
		onmove
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
		onlibrary: (scope: GearScope) => void;
		/** Move a setup to an index of `setups`. Resolves once it is saved. */
		onmove: (setup: CameraSetup, to: number) => Promise<void>;
	} = $props();

	// ---- moving setups: drag the grip, or arrow keys on it
	const reorderable = $derived(query.trim() === '' && setups.length > 1);
	let list = $state<HTMLElement | null>(null);
	let drag = $state<{ id: string; pointer: number; from: number; to: number; y0: number; dy: number; h: number; top: number; mids: number[]; min: number; max: number } | null>(null);

	function grab(setup: CameraSetup, e: PointerEvent) {
		if (e.button !== 0 || !list) return;
		e.preventDefault();
		const rows = [...list.querySelectorAll<HTMLElement>('[data-setup-row]')];
		const rects = rows.map((r) => r.getBoundingClientRect());
		const from = setups.findIndex((s) => s.id === setup.id);
		if (from < 0 || rects.length !== setups.length) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		const own = rects[from];
		drag = {
			id: setup.id,
			pointer: e.pointerId,
			from,
			to: from,
			y0: e.clientY,
			dy: 0,
			h: own.height,
			top: own.top,
			mids: rects.map((r) => r.top + r.height / 2),
			min: rects[0].top - own.top,
			max: rects[rects.length - 1].bottom - own.bottom
		};
	}
	function follow(e: PointerEvent) {
		const d = drag;
		if (!d || e.pointerId !== d.pointer) return;
		const dy = Math.max(d.min, Math.min(d.max, e.clientY - d.y0));
		// A row above trades places once the dragged top passes its middle; a row below, the dragged bottom.
		const top = d.top + dy;
		const to = d.mids.filter((m, i) => (i < d.from ? m < top : i > d.from && m < top + d.h)).length;
		drag = { ...d, dy, to };
	}
	async function drop(e: PointerEvent) {
		const d = drag;
		if (!d || e.pointerId !== d.pointer) return;
		const setup = setups[d.from];
		if (e.type === 'pointerup' && d.to !== d.from && setup) await onmove(setup, d.to);
		drag = null;
	}
	/** Where a row sits while another is dragged. */
	function offsetOf(index: number): number {
		const d = drag;
		if (!d) return 0;
		if (index === d.from) return d.dy;
		if (d.from < d.to && index > d.from && index <= d.to) return -d.h;
		if (d.to < d.from && index >= d.to && index < d.from) return d.h;
		return 0;
	}
	async function key(setup: CameraSetup, index: number, e: KeyboardEvent) {
		const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null;
		if (to === null) return;
		e.preventDefault();
		if (to < 0 || to >= setups.length) return;
		await onmove(setup, to);
		await tick();
		list?.querySelector<HTMLElement>(`[data-setup-handle="${setup.id}"]`)?.focus();
	}

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
		<!-- The grip button is the control; the drag it starts is followed here, where it bubbles. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="setups" bind:this={list} onpointermove={follow} onpointerup={drop} onpointercancel={drop}>
		<Section header={header(t('gear.setups'), shownSetups.length, setups.length)}>
			{#each shownSetups as setup, i (setup.id)}
				<SetupRow
					id={setup.id}
					handle={reorderable ? { onpointerdown: (e) => grab(setup, e), onkeydown: (e) => key(setup, i, e) } : undefined}
					offset={offsetOf(i)}
					dragging={drag?.id === setup.id}
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
		</div>
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
				<Row title={t('gear.library')} class="tint" onclick={() => onlibrary('camera')}>
					{#snippet leading()}<span class="add" aria-hidden="true"><LibraryBig class="size-[18px]" strokeWidth={2.2} /></span>{/snippet}
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
				<Row title={t('gear.library')} class="tint" onclick={() => onlibrary('lens')}>
					{#snippet leading()}<span class="add" aria-hidden="true"><LibraryBig class="size-[18px]" strokeWidth={2.2} /></span>{/snippet}
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
