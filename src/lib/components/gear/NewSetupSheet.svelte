<script lang="ts">
	// A new camera setup: its letter, the next free one to start. Created as one edit; the camera
	// and lens are picked on the setup itself.
	import Button from '$lib/components/ios/Button.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { findField } from '$lib/model/catalogue';
	import type { CameraSetup } from '$lib/model/types';
	import { fieldLabel } from '$lib/i18n/modelText';
	import { t, tk } from '$lib/i18n/messages';
	import { blankSetup, nextSetupLabel, setupLabelTaken } from '$lib/gear/setups';

	let {
		open = $bindable(false),
		setups,
		projectId,
		oncreated
	}: { open?: boolean; setups: CameraSetup[]; projectId: string; oncreated: (setup: CameraSetup) => void } = $props();

	const app = useApp();
	const labelDef = findField('cameraSetup', 'cameraLabel')!.def;
	let label = $state('');
	let wasOpen = false;
	$effect.pre(() => {
		if (open && !wasOpen) label = nextSetupLabel(setups);
		wasOpen = open;
	});
	const taken = $derived(setupLabelTaken(setups, label));

	async function create(event?: SubmitEvent) {
		event?.preventDefault();
		if (label.trim() === '' || taken) return;
		const setup = blankSetup(app.newId(), projectId, label);
		await app.edit.create('cameraSetup', setup, { label: { key: 'edit.created', params: { what: `${tk('scope.cameraSetup')} ${setup.cameraLabel}` } } });
		open = false;
		oncreated(setup);
	}
</script>

<Sheet bind:open title={t('gear.new.cameraSetup')}>
	{#snippet leading()}<Button variant="plain" onclick={() => (open = false)}>{t('common.cancel')}</Button>{/snippet}
	{#snippet trailing()}<Button variant="plain" class="strong" onclick={() => create()} disabled={label.trim() === '' || taken}>{t('common.create')}</Button>{/snippet}
	<form onsubmit={create} novalidate class="new-setup">
		<Section footer={t('gear.new.setup.footer')}>
			<InputRow label={fieldLabel(labelDef)} bind:value={label} autocapitalize="words" enterkeyhint="done" error={taken ? t('gear.label.taken') : undefined} />
		</Section>
	</form>
</Sheet>

<style>
	.new-setup {
		padding-top: 8px;
	}
</style>
