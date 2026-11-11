<script lang="ts">
	// A new camera or lens: every catalogue field, only the model needed. Create saves it as one
	// edit (Undo takes it away) and hands back the new entry. A field that does not read says why
	// once the person leaves it or presses Create.
	import Button from '$lib/components/ios/Button.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { issueText } from '$lib/i18n/modelText';
	import { t, tk } from '$lib/i18n/messages';
	import { gearTitle, type GearScope } from '$lib/gear/names';
	import { draftRecord } from '$lib/gear/records';
	import type { Camera, Lens } from '$lib/model/types';
	import GearFields from './GearFields.svelte';

	let {
		open = $bindable(false),
		scope,
		projectId,
		oncreated
	}: { open?: boolean; scope: GearScope; projectId: string; oncreated: (record: Camera | Lens) => void } = $props();

	const app = useApp();
	let texts = $state<Record<string, string>>({});
	let touched = $state<Record<string, boolean>>({});
	let tried = $state(false);
	let id = $state('');
	$effect.pre(() => {
		if (open) return;
		texts = {};
		touched = {};
		tried = false;
		id = '';
	});

	const draft = $derived(draftRecord(scope, texts, settings.value.units, id || 'draft', projectId));
	const errors = $derived(
		Object.fromEntries(Object.entries(draft.issues).map(([key, issue]) => [key, tried || (touched[key] && issue.key !== 'validation.required') ? issueText(issue) : undefined]))
	);
	const canCreate = $derived((texts[scope === 'camera' ? 'cameraModel' : 'lensModel'] ?? '').trim() !== '');

	async function create() {
		tried = true;
		if (!draft.ok) return;
		const record = { ...draft.record, id: app.newId() };
		await app.edit.create(scope, record, { label: { key: 'edit.created', params: { what: gearTitle(scope, record) || tk(`scope.${scope}`) } } });
		open = false;
		oncreated(record);
	}
</script>

<Sheet bind:open title={t(scope === 'camera' ? 'gear.new.camera' : 'gear.new.lens')}>
	{#snippet leading()}<Button variant="plain" onclick={() => (open = false)}>{t('common.cancel')}</Button>{/snippet}
	{#snippet trailing()}<Button variant="plain" class="strong" onclick={create} disabled={!canCreate}>{t('common.create')}</Button>{/snippet}
	<form
		class="new-gear"
		novalidate
		onsubmit={(e) => {
			e.preventDefault();
			void create();
		}}
	>
		{#if open}
			<GearFields
				{scope}
				values={texts}
				{errors}
				autofocus
				onedit={(key, text) => (texts = { ...texts, [key]: text })}
				oncommit={(key, text) => {
					texts = { ...texts, [key]: text };
					touched = { ...touched, [key]: true };
				}}
				footer={t(scope === 'camera' ? 'gear.new.footer.camera' : 'gear.new.footer.lens')}
			/>
		{/if}
	</form>
</Sheet>

<style>
	.new-gear {
		padding: 8px 0 24px;
	}
</style>
