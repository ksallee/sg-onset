<script lang="ts">
	// The kinds of reference, from Settings: the built-in ones, then the project's own, which can be
	// added and deleted. The project's kinds stay on this device (store README, decision 26); a
	// reference keeps its kind when the kind is deleted.
	import Button from '$lib/components/ios/Button.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import type { ReferenceKind } from '$lib/model/types';
	import { kindLabel, KINDS, kindProblem } from '$lib/references/kinds';

	let { open = $bindable(false), projectId }: { open?: boolean; projectId: string | undefined } = $props();

	const app = useApp();
	const rows = liveList('referenceKind', () => projectId);
	const label = (kind: string) => kindLabel(kind, tk);

	let name = $state('');
	let problem = $state<'empty' | 'taken' | undefined>();
	const own = $derived(rows.value.map((k) => k.name));

	async function add(event?: SubmitEvent) {
		event?.preventDefault();
		if (!projectId) return;
		const found = kindProblem(name, own, label);
		if (found) return void (problem = found);
		const kind: ReferenceKind = { id: app.newId(), projectId, name: name.trim() };
		name = '';
		problem = undefined;
		await app.edit.create('referenceKind', kind, { label: { key: 'edit.created', params: { what: kind.name } } });
	}
	async function remove(kind: ReferenceKind) {
		await app.edit.remove('referenceKind', kind.id, { key: 'edit.removed', params: { what: kind.name } });
	}
</script>

<Sheet bind:open title={t('references.kinds.title')} done>
	<Section header={t('references.kinds.builtIn')}>
		{#each KINDS as k (k)}
			<Row title={label(k)} class="quiet" />
		{/each}
	</Section>
	<Section header={t('references.kinds.project')}>
		{#each rows.value as k (k.id)}
			<Row title={k.name}>
				{#snippet trailing()}<Button variant="plain" destructive onclick={() => remove(k)}>{t('references.kinds.delete')}</Button>{/snippet}
			</Row>
		{:else}
			<Row title={t('references.none')} class="quiet" />
		{/each}
	</Section>
	<!-- Return adds it: the row leaves the field on Return, so the form would not submit by itself. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<form onsubmit={add} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), void add())} novalidate>
		<Section footer={t('references.kinds.project.footer')}>
			<InputRow
				label={t('references.kinds.new')}
				bind:value={name}
				placeholder={t('references.kinds.new.placeholder')}
				enterkeyhint="done"
				oninput={() => (problem = undefined)}
				error={problem === 'empty' ? t('references.kinds.empty') : problem === 'taken' ? t('references.kinds.taken') : undefined}
			/>
			<Row title={t('references.kinds.add')} class="tint" onclick={() => add()} />
		</Section>
	</form>
</Sheet>
