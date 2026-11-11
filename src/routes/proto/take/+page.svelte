<script lang="ts">
	// The take screen prototype is gone: the real take screen is Shoot. Old links land there.
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/messages';

	onMount(() => void goto('/shoot', { replaceState: true }));
</script>

<p class="moved"><a href="/shoot">{t('shoot.title')}</a></p>

<style>
	.moved {
		padding: 24px;
	}
</style>
