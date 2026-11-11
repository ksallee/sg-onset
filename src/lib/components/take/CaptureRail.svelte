<script lang="ts">
	// The take screen's rail: Start / End and Photo as capture targets, New take and Undo under
	// them. Start stamps the press instant, the moment the finger landed, not when the handler
	// ran. Photo opens the native camera through a file input (`capture`): the still comes back as
	// a file and goes on the take. No in-page camera. `S` presses Start / End from a keyboard.
	import { Camera, Plus, Undo2 } from '@lucide/svelte';
	import Rail from '$lib/components/ios/Rail.svelte';
	import RailButton from '$lib/components/ios/RailButton.svelte';
	import RecordButton from '$lib/components/ios/RecordButton.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { t } from '$lib/i18n/messages';
	import type { WorkspaceLayout } from '$lib/ios/handedness';
	import type { Shoot } from '$lib/take/shoot.svelte';

	let { shoot, edge }: { shoot: Shoot; edge: WorkspaceLayout['rail'] } = $props();

	const app = useApp();
	const ending = $derived(shoot.target.action === 'end');
	// The button shows the take it acts on: running while one runs; ended (with its tick) when the
	// take on screen ended and the next press makes the next one.
	const phase = $derived(ending ? 'rolling' : shoot.phase === 'filed' ? 'filed' : 'idle');

	let input = $state<HTMLInputElement | null>(null);
	function picked() {
		const file = input?.files?.[0];
		if (file) shoot.addPhoto(file);
		if (input) input.value = '';
	}
</script>

{#snippet capture()}
	<RecordButton
		rolling={ending}
		{phase}
		label={ending ? t('rail.cut') : t('rail.record')}
		caption={ending ? t('rail.cut') : t('rail.record')}
		detail={t('take.row', { take: shoot.target.number })}
		since={ending ? shoot.runningStart : null}
		shortcut="s"
		onpress={(at) => void shoot.press(at)}
	/>
	<RailButton capture label={t('rail.photo')} badge={shoot.groupStills.length || undefined} onclick={() => input?.click()}><Camera class="size-9" strokeWidth={1.8} /></RailButton>
{/snippet}

{#snippet more()}
	<RailButton label={t('rail.newTake')} disabled={ending || !shoot.slate} onclick={() => void shoot.newTake()}><Plus class="size-7" strokeWidth={2.2} /></RailButton>
	<RailButton label={t('rail.undo')} disabled={!app.canUndo} onclick={() => void app.edit.undo()}><Undo2 class="size-6" strokeWidth={2.2} /></RailButton>
{/snippet}

<Rail {edge} label={t('rail.label')} rolling={ending} {capture} {more} />
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
