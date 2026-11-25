<script lang="ts">
	// The rigs, from Settings, as the kinds of reference are (#138): the built-in ones, then the
	// project's own, which can be added and deleted. The project's rigs sync to Flow PT for every
	// device of the project; a camera setup or a take keeps its rig when the rig is deleted.
	import Button from '$lib/components/ios/Button.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { rigLabel, RIGS, rigProblem } from '$lib/gear/rigs';
	import { t, tk } from '$lib/i18n/messages';
	import type { Rig } from '$lib/model/types';

	let { open = $bindable(false), projectId }: { open?: boolean; projectId: string | undefined } = $props();

	const app = useApp();
	const rows = liveList('rig', () => projectId);
	const label = (rig: string) => rigLabel(rig, tk);

	let name = $state('');
	let problem = $state<'empty' | 'taken' | undefined>();
	const own = $derived(rows.value.map((r) => r.name));

	async function add(event?: SubmitEvent) {
		event?.preventDefault();
		if (!projectId) return;
		const found = rigProblem(name, own, label);
		if (found) return void (problem = found);
		const rig: Rig = { id: app.newId(), projectId, name: name.trim() };
		name = '';
		problem = undefined;
		await app.edit.create('rig', rig, { label: { key: 'edit.created', params: { what: rig.name } } });
	}
	async function remove(rig: Rig) {
		await app.edit.remove('rig', rig.id, { key: 'edit.removed', params: { what: rig.name } });
	}
</script>

<Sheet bind:open title={t('gear.rigs.title')} done>
	<Section header={t('gear.rigs.builtIn')}>
		{#each RIGS as r (r)}
			<Row title={label(r)} class="quiet" />
		{/each}
	</Section>
	<Section header={t('gear.rigs.project')}>
		{#each rows.value as r (r.id)}
			<Row title={r.name}>
				{#snippet trailing()}<Button variant="plain" destructive onclick={() => remove(r)}>{t('gear.rigs.delete')}</Button>{/snippet}
			</Row>
		{:else}
			<Row title={t('gear.rigs.none')} class="quiet" />
		{/each}
	</Section>
	<!-- Return adds it: the row leaves the field on Return, so the form would not submit by itself. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<form onsubmit={add} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), void add())} novalidate>
		<Section footer={t('gear.rigs.project.footer')}>
			<InputRow
				label={t('gear.rigs.new')}
				bind:value={name}
				placeholder={t('gear.rigs.new.placeholder')}
				enterkeyhint="done"
				oninput={() => (problem = undefined)}
				error={problem === 'empty' ? t('gear.rigs.empty') : problem === 'taken' ? t('gear.rigs.taken') : undefined}
			/>
			<Row title={t('gear.rigs.add')} class="tint" onclick={() => add()} />
		</Section>
	</form>
</Sheet>
