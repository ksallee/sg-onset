<script lang="ts">
	// What waits for the Rig of Take or Camera Setup (Kevin, #138): one line, while the site lacks the
	// field and a take or camera setup on this device holds a rig (app/sync/waiting.ts). The Rig is
	// the only optional field; another one gets its own words.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { live } from '$lib/app/live.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { fieldsHeld } from '$lib/app/sync/waiting';
	import { t } from '$lib/i18n/messages';

	const sync = useSync();
	const held = live<string[]>(
		['take', 'cameraSetup'],
		async (store) => {
			// Read before the first await: the effect then follows it.
			const missing = sync.state.fieldsMissing ?? [];
			if (!missing.length) return [];
			const [take, cameraSetup] = await Promise.all([store.rows('take'), store.rows('cameraSetup')]);
			return fieldsHeld(missing, { take: take as Record<string, unknown>[], cameraSetup: cameraSetup as Record<string, unknown>[] });
		},
		[]
	);
</script>

{#if held.value.length}
	<Section header={t('sync.rigs.header')}>
		<Row title={t('sync.rigs.waiting')} />
	</Section>
{/if}
