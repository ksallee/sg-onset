<script lang="ts">
	// The audio notes of the take on screen, in the take sheet (#89). Add Audio Note opens the
	// microphone; the same row then says Save Audio Note and the time it has run. Closing the sheet
	// keeps what was heard. Each note plays here, one at a time, and can be taken off. The note
	// being made is lib/take/audioNotes.svelte.ts; each note a row (AudioNoteRow).
	import { Mic, Square } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import { t } from '$lib/i18n/messages';
	import { AudioNoteCapture } from '$lib/take/audioNotes.svelte';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import AudioNoteRow from './AudioNoteRow.svelte';

	let { shoot, open }: { shoot: Shoot; open: boolean } = $props();

	const capture = new AudioNoteCapture((file, at) => shoot.addAudioNote(file, at));
	let playing = $state<string | null>(null);

	// The sheet is closing: what was heard is kept now, not once the sheet has slid away.
	$effect(() => {
		if (!open) capture.end();
	});
</script>

<Section header={t('audio.title')}>
	<Row title={capture.busy ? t('audio.save') : t('audio.add')} detail={capture.busy ? capture.elapsed : undefined} onclick={() => capture.press()}>
		{#snippet leading()}<Tile icon={capture.busy ? Square : Mic} color={capture.busy ? 'var(--record)' : 'var(--tint)'} />{/snippet}
	</Row>
	{#each shoot.groupAudio as still, i (still.id)}
		<AudioNoteRow {still} n={i + 1} pending={shoot.pending[still.id]} bind:playing onremove={() => shoot.removeStill(still)} />
	{/each}
	{#snippet footer()}
		{#if capture.issue}<span class="issue" role="status">{capture.issue}</span>{:else}{t('audio.footer')}{/if}
	{/snippet}
</Section>

<style>
	.issue {
		color: var(--destructive);
	}
</style>
