<script lang="ts">
	// The Gear page: the list of the project's camera setups, cameras and lenses beside the entry
	// picked, as iPad Settings. With less than 760 px of room the two stack: the list, and a tap
	// opens the entry on its own. What is picked is in the address (`?sel=lens.<id>`), so a reload
	// keeps it. Every write goes through the editor: the shell's notice offers Undo.
	import { Camera as CameraIcon, FileUp, MousePointerClick } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import Menu from '$lib/components/ios/Menu.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { findField } from '$lib/model/catalogue';
	import type { Camera, CameraSetup, Lens } from '$lib/model/types';
	import type { Label } from '$lib/app/undo';
	import { fieldLabel } from '$lib/i18n/modelText';
	import { t, tk } from '$lib/i18n/messages';
	import { sortCameras, sortLenses } from '$lib/gear/list';
	import { cameraTitle, gearTitle, lensTitle, type GearScope } from '$lib/gear/names';
	import { duplicateGear, formSelection, parseSelection, type Selection } from '$lib/gear/records';
	import { moveSetup, setupsUsing, sortSetups } from '$lib/gear/setups';
	import GearDetail from './GearDetail.svelte';
	import GearList from './GearList.svelte';
	import GearPicker from './GearPicker.svelte';
	import NewGearSheet from './NewGearSheet.svelte';
	import NewSetupSheet from './NewSetupSheet.svelte';
	import SetupDetail from './SetupDetail.svelte';

	/** The room from which the list and the entry sit side by side. */
	const SPLIT_FROM = 760;

	const app = useApp();
	const current = useCurrent();
	const projectId = $derived(current.project!.id);
	const cameraRows = liveList('camera', () => current.project?.id);
	const lensRows = liveList('lens', () => current.project?.id);
	const setupRows = liveList('cameraSetup', () => current.project?.id);
	// Every take, for the pickers' Recent group: the gear the latest takes were shot on.
	const takes = liveList('take');

	const cameras = $derived(sortCameras(cameraRows.value));
	const lenses = $derived(sortLenses(lensRows.value));
	const setups = $derived(sortSetups(setupRows.value));
	const ready = $derived(cameraRows.ready && lensRows.ready && setupRows.ready);
	const empty = $derived(ready && cameras.length + lenses.length + setups.length === 0);

	let width = $state(0);
	const wide = $derived(width >= SPLIT_FROM);
	let query = $state('');

	const selection = $derived(parseSelection(page.url.searchParams.get('sel')));
	const selected = $derived.by(() => {
		const s = selection;
		if (!s) return undefined;
		if (s.scope === 'camera') return cameras.find((c) => c.id === s.id);
		if (s.scope === 'lens') return lenses.find((l) => l.id === s.id);
		return setups.find((x) => x.id === s.id);
	});
	const alone = $derived(!wide && selected !== undefined);
	const selectedTitle = $derived.by(() => {
		if (!selection || !selected) return '';
		if (selection.scope === 'cameraSetup') return (selected as CameraSetup).cameraLabel ?? '';
		return gearTitle(selection.scope, selected as Camera | Lens) || t('gear.untitled');
	});

	// On a phone width a pick is a page of its own: Back returns to the list.
	let pushed = false;
	function select(next: Selection | undefined) {
		const url = next ? `/gear?sel=${encodeURIComponent(formSelection(next))}` : '/gear';
		pushed = !wide && next !== undefined;
		void goto(url, { replaceState: wide || !next, noScroll: wide, keepFocus: true });
	}
	function back() {
		if (pushed) history.back();
		else select(undefined);
		pushed = false;
	}

	// ---- sheets
	let adding = $state<GearScope | 'cameraSetup' | null>(null);
	let addOpen = $state(false);
	let setupOpen = $state(false);
	function add(scope: GearScope | 'cameraSetup') {
		adding = scope;
		if (scope === 'cameraSetup') setupOpen = true;
		else addOpen = true;
	}
	const importFrom = (scope: GearScope) => goto(`/gear/import?kind=${scope}`);

	let picking = $state<{ kind: 'camera' | 'lens'; setupId: string } | null>(null);
	let pickerOpen = $state(false);
	const pickingSetup = $derived(picking ? setups.find((s) => s.id === picking!.setupId) : undefined);
	function openPicker(setup: CameraSetup, kind: 'camera' | 'lens') {
		picking = { kind, setupId: setup.id };
		pickerOpen = true;
	}
	async function assign(id: string | undefined) {
		const setup = pickingSetup;
		if (!setup || !picking) return;
		const key = picking.kind === 'camera' ? 'cameraId' : 'lensId';
		if (setup[key] === id) return;
		const label = setup.cameraLabel ?? '';
		const lens = lenses.find((l) => l.id === id);
		const camera = cameras.find((c) => c.id === id);
		const what: Label = id === undefined
			? { key: 'gear.edit.cleared', params: { setup: label, field: fieldLabel(findField('cameraSetup', key)!.def) } }
			: picking.kind === 'lens'
				? { key: 'gear.edit.lens', params: { setup: label, lens: lens ? lensTitle(lens) : '' } }
				: { key: 'gear.edit.camera', params: { setup: label, camera: camera ? cameraTitle(camera) : '' } };
		await app.edit.set('cameraSetup', setup, key, id, what);
	}

	// ---- entries
	async function duplicate(scope: GearScope, record: Camera | Lens) {
		const copy = duplicateGear(scope, record, app.newId());
		await app.edit.create(scope, copy, { label: { key: 'gear.edit.duplicated', params: { what: gearTitle(scope, record) || tk(`scope.${scope}`) } } });
		select({ scope, id: copy.id });
	}
	/** Deletes a camera or lens, and takes it off the setups that hold it, as one edit. Takes keep it. */
	async function remove(scope: GearScope, record: Camera | Lens) {
		const key = scope === 'camera' ? 'cameraId' : 'lensId';
		await app.edit.group({ key: 'edit.removed', params: { what: gearTitle(scope, record) || tk(`scope.${scope}`) } }, async () => {
			for (const setup of setupsUsing(setups, key, record.id)) await app.edit.set('cameraSetup', setup, key, undefined);
			await app.edit.remove(scope, record.id);
		});
		select(undefined);
	}
	/** Moves a setup to an index of the sorted list: every order that changes, as one edit. */
	async function move(setup: CameraSetup, to: number) {
		const changes = moveSetup(setups, setup.id, to);
		if (!changes.length) return;
		const place = Math.max(0, Math.min(to, setups.length - 1)) + 1;
		await app.edit.group({ key: 'gear.edit.moved', params: { setup: setup.cameraLabel ?? '', n: place } }, async () => {
			for (const change of changes) await app.edit.set('cameraSetup', change.setup, 'order', change.order);
		});
	}
	async function removeSetup(setup: CameraSetup) {
		await app.edit.remove('cameraSetup', setup.id, { key: 'edit.removed', params: { what: `${tk('scope.cameraSetup')} ${setup.cameraLabel ?? ''}` } });
		select(undefined);
	}

	const importItems = [
		{ label: t('gear.cameras'), run: () => importFrom('camera') },
		{ label: t('gear.lenses'), run: () => importFrom('lens') }
	];
</script>

<svelte:head><title>{alone ? selectedTitle : t('gear.title')} · {t('app.name')}</title></svelte:head>

<Page width="full">
	{#if alone}
		<NavBar title={selectedTitle} back={{ label: t('gear.title'), onclick: back }} />
	{:else}
		<NavBar title={t('gear.title')} large>
			{#snippet trailing()}
				<Menu items={importItems}>
					{#snippet trigger(props)}
						<Button variant="plain" {...props}><FileUp class="size-[19px]" strokeWidth={2.2} />{t('gear.import')}</Button>
					{/snippet}
				</Menu>
			{/snippet}
		</NavBar>
		<div class="context"><ContextBar day={false} /></div>
	{/if}

	{#if empty}
		<EmptyState icon={CameraIcon} title={t('gear.empty')} message={t('gear.empty.message')}>
			{#snippet action()}
				<div class="empty-actions">
					<Button variant="filled" onclick={() => add('camera')}>{t('gear.add.camera')}</Button>
					<Button variant="tinted" onclick={() => add('lens')}>{t('gear.add.lens')}</Button>
					<Button variant="gray" onclick={() => importFrom('lens')}>{t('gear.import')}</Button>
				</div>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="split" class:wide class:alone bind:clientWidth={width}>
			{#if !alone}
				<div class="list">
					<GearList
						{cameras}
						{lenses}
						{setups}
						bind:query
						{selection}
						{wide}
						onselect={select}
						onlens={(setup) => openPicker(setup, 'lens')}
						onadd={add}
						onimport={importFrom}
						onmove={move}
					/>
				</div>
			{/if}
			{#if wide || alone}
				<div class="pane" class:empty-pane={!selected}>
					{#if selection && selected}
						{#key formSelection(selection)}
							<div class="pane-in">
								{#if selection.scope === 'cameraSetup'}
									{@const setup = selected as CameraSetup}
									<SetupDetail {setup} {setups} {cameras} {lenses} onpick={(kind) => openPicker(setup, kind)} onmove={(to) => move(setup, to)} ondelete={() => removeSetup(setup)} />
								{:else}
									{@const scope = selection.scope}
									{@const record = selected as Camera | Lens}
									<GearDetail
										{scope}
										{record}
										usedBy={setupsUsing(setups, scope === 'camera' ? 'cameraId' : 'lensId', record.id)}
										onduplicate={() => duplicate(scope, record)}
										ondelete={() => remove(scope, record)}
										onsetup={(setup) => select({ scope: 'cameraSetup', id: setup.id })}
									/>
								{/if}
							</div>
						{/key}
					{:else}
						<div class="placeholder">
							<MousePointerClick class="size-[40px]" strokeWidth={1.4} aria-hidden="true" />
							<p class="big">{t('gear.pick')}</p>
							<p>{t('gear.pick.message')}</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</Page>

{#if adding && adding !== 'cameraSetup'}
	<NewGearSheet bind:open={addOpen} scope={adding} {projectId} oncreated={(r) => select({ scope: adding as GearScope, id: r.id })} />
{/if}
<NewSetupSheet bind:open={setupOpen} {setups} {projectId} oncreated={(s) => select({ scope: 'cameraSetup', id: s.id })} />
{#if picking}
	<GearPicker bind:open={pickerOpen} kind={picking.kind} setup={pickingSetup} {cameras} {lenses} takes={takes.value} onpick={assign} />
{/if}

<style>
	.context {
		padding-bottom: 4px;
	}
	.empty-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
	}
	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		max-width: 1240px;
	}
	.split.wide {
		grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
		gap: 8px;
		padding-right: var(--page-margin, 16px);
	}
	.split.wide .list {
		/* The list's sections keep the page's left margin; the gap does the rest. */
		--page-margin-right: 0px;
	}
	.pane {
		min-width: 0;
	}
	.split.wide .pane {
		position: sticky;
		top: 52px;
		max-height: calc(var(--app-height, 100dvh) - 64px);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 4px 0 24px;
		box-shadow: inset var(--hairline) 0 0 var(--separator);
	}
	.split.wide .pane :global(.ios-section),
	.split.wide .pane :global(.detail-head) {
		--page-margin: 24px;
	}
	.pane-in {
		animation: pane-in var(--dur-control, 0.25s) var(--ease-ios) both;
	}
	.split.alone .pane-in {
		animation-name: pane-push;
	}
	/* Reduced motion: the entry is there at once, no slide and no fade. */
	:global(html[data-motion='reduced']) .pane-in {
		animation: none;
	}
	@keyframes pane-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	@keyframes pane-push {
		from {
			opacity: 0;
			transform: translateX(24px);
		}
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 360px;
		padding: 24px;
		text-align: center;
		color: var(--label-2);
		font-size: 15px;
	}
	.placeholder .big {
		margin-top: 8px;
		font-size: 17px;
		font-weight: 600;
		color: var(--label);
	}
</style>
