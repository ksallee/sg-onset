<script lang="ts">
	// Notes on Shots (#97): a Note on each Shot with what was shot for it, written at sync. Off by
	// default, per project on this device (app/sync/notes.ts). While the site lacks the Note fields,
	// the footer says an admin runs Set Up Fields.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { notesView } from '$lib/app/sync/notes';
	import { t } from '$lib/i18n/messages';

	const sync = useSync();
	const view = $derived(notesView(sync.state.notesOnShots, sync.state.notesMissing === true));
</script>

<Section header={t('sync.notes.header')} footer={view === 'setup' ? t('sync.notes.setup') : t('sync.notes.footer')}>
	<Row title={t('sync.notes.toggle')}>
		{#snippet trailing()}<Toggle checked={sync.state.notesOnShots} onchange={(on) => void sync.setNotesOnShots(on)} label={t('sync.notes.toggle')} />{/snippet}
	</Row>
</Section>
