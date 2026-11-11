<script lang="ts">
	// The take on screen in a sheet: its note, and the cameras on it, one of which can be taken
	// off. A full sheet, so the keyboard never covers the note. Everything is undoable.
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { t } from '$lib/i18n/messages';
	import type { Shoot } from '$lib/take/shoot.svelte';

	let { shoot, open = $bindable(false) }: { shoot: Shoot; open?: boolean } = $props();

	let note = $state('');
	$effect(() => {
		if (open) note = shoot.note;
	});
	const number = $derived(shoot.group?.number ?? '');
	const on = $derived(shoot.columns.filter((c) => shoot.takeOf(c.id)));
</script>

<!-- What was typed is kept when the sheet closes, even if the field never lost focus. -->
<Sheet bind:open title={t('take.row', { take: number })} done={t('common.done')} onclose={() => note.trim() !== shoot.note && shoot.setNote(note)}>
	<Section header={t('note.label')}>
		<InputRow label={t('marks.note')} bind:value={note} placeholder={t('note.placeholder')} onchange={(text) => shoot.setNote(text)} />
	</Section>
	{#if on.length > 1}
		<Section header={t('take.cameras')}>
			{#each on as col (col.id)}
				<Row title={t('take.camera.remove', { id: col.label || '–', take: number })} destructive onclick={() => shoot.removeCamera(col.id)} />
			{/each}
		</Section>
	{/if}
</Sheet>
