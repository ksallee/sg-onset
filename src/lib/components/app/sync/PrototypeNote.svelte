<script lang="ts">
	// One line at the top of the sync sheet while signed in and the site is not set up: the app is
	// an early prototype, so a test project on a test site.
	import { auth } from '$lib/auth/session.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { prototypeNote } from '$lib/app/sync/review';
	import { t } from '$lib/i18n/messages';

	const sync = useSync();
</script>

{#if prototypeNote(auth.status, sync.state.ready)}
	<p class="note">{t('sync.prototype')}</p>
{/if}

<style>
	.note {
		margin: 0;
		padding: 4px calc(var(--page-margin, 16px) + 16px) 12px;
		font-size: 15px;
		line-height: 20px;
		color: var(--label-2);
	}
</style>
