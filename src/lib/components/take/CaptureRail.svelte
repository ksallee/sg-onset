<script lang="ts">
	// The take screen's rail: Record and Photo as capture targets, New take and Undo under them,
	// Setup in the corner. Photo opens the native camera through a file input (`capture`): the
	// still comes back as a file and goes on the take. No in-page camera.
	import { Camera, Plus, SlidersHorizontal, Undo2 } from '@lucide/svelte';
	import Rail from '$lib/components/ios/Rail.svelte';
	import RailButton from '$lib/components/ios/RailButton.svelte';
	import RecordButton from '$lib/components/ios/RecordButton.svelte';
	import { t } from '$lib/i18n/messages';
	import type { WorkspaceLayout } from '$lib/ios/handedness';
	import { formatElapsed } from '$lib/take/record';
	import type { TakeScreen } from '$lib/take/screen.svelte';

	let {
		screen,
		edge,
		settingsOpen,
		onsettings
	}: { screen: TakeScreen; edge: WorkspaceLayout['rail']; settingsOpen: boolean; onsettings: () => void } = $props();

	const side = $derived(!edge.startsWith('bottom'));
	const rolling = $derived(screen.target.action === 'cut');

	let input = $state<HTMLInputElement | null>(null);
	function picked() {
		const file = input?.files?.[0];
		if (file) screen.addPhoto(file);
		if (input) input.value = '';
	}
</script>

{#snippet top()}
	<RailButton label={t('rail.settings')} pressed={settingsOpen} onclick={onsettings}><SlidersHorizontal class="size-6" strokeWidth={2} /></RailButton>
{/snippet}

{#snippet capture()}
	<RecordButton
		{rolling}
		label={rolling ? t('rail.cut') : t('rail.record')}
		detail={rolling ? formatElapsed(screen.rollingElapsed) : t('take.row', { take: screen.target.take })}
		onclick={() => screen.record()}
	/>
	<RailButton capture label={t('rail.photo')} badge={screen.take.stills.length} onclick={() => input?.click()}><Camera class="size-9" strokeWidth={1.8} /></RailButton>
{/snippet}

{#snippet more()}
	<RailButton label={t('rail.newTake')} disabled={rolling} onclick={() => screen.newTake()}><Plus class="size-7" strokeWidth={2.2} /></RailButton>
	<RailButton label={t('rail.undo')} disabled={!screen.canUndo} onclick={() => screen.undo()}><Undo2 class="size-6" strokeWidth={2.2} /></RailButton>
{/snippet}

<Rail {edge} label={t('rail.label')} {rolling} top={side ? top : undefined} {capture} {more} />
<input bind:this={input} class="file" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true" onchange={picked} />

<style>
	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
