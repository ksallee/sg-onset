<script lang="ts">
	// The take on screen in a sheet: its note, its type (one tap), the plates at its tail (either or
	// both, a tap each), its template, photos and videos from the library or Files, its audio notes
	// from the microphone (AudioNotes), and the cameras on it, one of which can be taken off. A full
	// sheet, so the keyboard never covers the note. Everything is undoable. The rail's Photo stays
	// the camera, in one press.
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import { TAKE_TAILS } from '$lib/model/takeTail';
	import { TAKE_TYPES } from '$lib/model/takeType';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import AudioNotes from './AudioNotes.svelte';
	import TakeTemplate from './TakeTemplate.svelte';

	let { shoot, open = $bindable(false) }: { shoot: Shoot; open?: boolean } = $props();

	let note = $state('');
	$effect(() => {
		if (open) note = shoot.note;
	});
	const number = $derived(shoot.group?.number ?? '');
	const on = $derived(shoot.columns.filter((c) => shoot.takeOf(c.id)));

	// No `capture`: the system offers the photo library and Files, several at a time.
	let library = $state<HTMLInputElement | null>(null);
	function picked() {
		const files = [...(library?.files ?? [])];
		if (library) library.value = '';
		if (files.length) void shoot.addFiles(files);
	}
</script>

<!-- What was typed is kept when the sheet closes, even if the field never lost focus. -->
<Sheet bind:open title={t('take.row', { take: number })} done={t('common.done')} onclose={() => note.trim() !== shoot.note && shoot.setNote(note)}>
	<Section header={t('note.label')}>
		<InputRow label={t('marks.note')} bind:value={note} placeholder={t('note.placeholder')} onchange={(text) => shoot.setNote(text)} />
	</Section>
	{#if shoot.group}
		<Section header={tk('field.take.takeType')}>
			{#each TAKE_TYPES as type (type)}
				<Row title={tk(`field.take.takeType.${type}`)} checked={shoot.type === type} onclick={() => shoot.setType(type)} />
			{/each}
		</Section>
		<Section header={tk('field.take.takeTail')}>
			{#each TAKE_TAILS as tail (tail)}
				{@const label = tk(`field.take.takeTail.${tail}`)}
				<!-- Said "Clean plate at the tail": the Type above has a Clean plate too. -->
				{#snippet title()}<span aria-hidden="true">{label}</span><span class="sr-only">{t('take.tail.row', { tail: label })}</span>{/snippet}
				<Row {title} checked={shoot.tail.includes(tail)} onclick={() => shoot.toggleTail(tail)} />
			{/each}
		</Section>
		<TakeTemplate {shoot} />
	{/if}
	<Section header={t('photos.title')} footer={t('photos.add.footer')}>
		<Row title={t('photos.add')} detail={shoot.groupStills.length ? String(shoot.groupStills.length) : undefined} onclick={() => library?.click()} />
	</Section>
	<input bind:this={library} class="file" type="file" accept="image/*,video/*" multiple tabindex="-1" aria-hidden="true" onchange={picked} />
	<AudioNotes {shoot} {open} />
	{#if on.length > 1}
		<Section header={t('take.cameras')}>
			{#each on as col (col.id)}
				<Row title={t('take.camera.remove', { id: col.label || '–', take: number })} destructive onclick={() => shoot.removeCamera(col.id)} />
			{/each}
		</Section>
	{/if}
</Sheet>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
