<script lang="ts">
	// The second tap of adding a reference: its name, under the kind picked. The name is suggested
	// after the last reference of that kind in the project and can be typed over; Add or Return
	// files it. The device and the card or roll come from that last one (lib/references/log.ts).
	import Button from '$lib/components/ios/Button.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import { fieldLabel } from '$lib/i18n/modelText';
	import { findField } from '$lib/model/catalogue';
	import type { Reference } from '$lib/model/types';
	import { kindLabel } from '$lib/references/kinds';
	import { lastOfKind, newReference, nextReferenceName } from '$lib/references/log';

	let { open = $bindable(false), kind, slateId, project }: { open?: boolean; kind: string; slateId: string; project: Reference[] } = $props();

	const app = useApp();
	const nameDef = findField('reference', 'name')!.def;
	const last = $derived(lastOfKind(project, kind));
	const carried = $derived([last?.device, last?.cardOrRoll].filter(Boolean).join(' · '));

	let name = $state('');
	let wasOpen = false;
	$effect.pre(() => {
		if (open && !wasOpen) name = nextReferenceName(last?.name);
		wasOpen = open;
	});

	// Return and Add can both fire: one reference.
	let busy = false;
	async function create(event?: SubmitEvent) {
		event?.preventDefault();
		if (name.trim() === '' || busy) return;
		busy = true;
		try {
			const ref = newReference(app.newId(), slateId, kind, name, new Date(app.now()).toISOString(), last);
			await app.edit.create('reference', ref, { label: { key: 'edit.created', params: { what: `${tk('scope.reference')} ${ref.name}` } } });
			open = false;
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open title={kindLabel(kind, tk)}>
	{#snippet leading()}<Button variant="plain" onclick={() => (open = false)}>{t('common.cancel')}</Button>{/snippet}
	{#snippet trailing()}<Button variant="plain" class="strong" onclick={() => create()} disabled={name.trim() === ''}>{t('references.new.add')}</Button>{/snippet}
	<!-- Return files it: the row leaves the field on Return, so the form would not submit by itself. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<form onsubmit={create} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), void create())} novalidate class="new-reference">
		<Section footer={carried ? `${t('references.new.footer')} ${t('references.new.carried', { detail: carried })}` : t('references.new.footer')}>
			<InputRow label={fieldLabel(nameDef)} bind:value={name} placeholder={t('references.new.placeholder')} autocapitalize="off" enterkeyhint="done" />
		</Section>
	</form>
</Sheet>

<style>
	.new-reference {
		padding-top: 8px;
	}
</style>
