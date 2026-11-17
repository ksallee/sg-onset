<script lang="ts">
	// One reference, opened from the slate's list: its kind picked, its other fields typed and
	// checked, each saved as it is left, and Delete. A kind or a delete may turn a switch on or
	// offer one off (lib/references/edit.ts). Read live, so an undo shows at once.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import FieldRow from '$lib/components/slates/FieldRow.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { liveRecord } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import { fieldLabel } from '$lib/i18n/modelText';
	import { findField } from '$lib/model/catalogue';
	import { removeReference, setReferenceKind } from '$lib/references/edit';
	import { kindLabel } from '$lib/references/kinds';
	import { fieldRefs } from '$lib/slates/fields';

	let { open = $bindable(false), id, kinds }: { open?: boolean; id: string | undefined; kinds: string[] } = $props();

	const app = useApp();
	const record = liveRecord('reference', () => id);
	const ref = $derived(record.value);
	const kindDef = findField('reference', 'kind')!.def;
	// The kind has its own picker; the logged time is not typed.
	const FIELDS = fieldRefs('reference').filter((f) => f.key !== 'kind' && f.key !== 'loggedAt');
	const label = (kind: string) => kindLabel(kind, tk);
	// A kind the project no longer lists stays pickable on the reference that holds it.
	const options = $derived(ref?.kind && !kinds.includes(ref.kind) ? [...kinds, ref.kind] : kinds);
	const kindId = $props.id();

	async function save(key: string, value: unknown, labelText: string) {
		const r = ref;
		if (!r) return;
		await app.edit.set('reference', r, key, value, { key: 'edit.changed', params: { field: labelText } });
	}
	async function remove() {
		const r = ref;
		if (!r) return;
		open = false;
		await removeReference(app, r, { key: 'edit.removed', params: { what: `${tk('scope.reference')} ${r.name ?? ''}` } });
	}
	// A kind turns its switch on, and the kind it leaves may offer one off.
	async function setKind(kind: string) {
		const r = ref;
		if (!r || kind === r.kind) return;
		await setReferenceKind(app, r, kind, { key: 'edit.changed', params: { field: fieldLabel(kindDef) } });
	}
</script>

<Sheet bind:open title={ref?.name ?? ''} done>
	{#if ref}
		<Section>
			<div class="pick" role="listitem">
				<label class="cell" for={kindId}>
					<span class="label">{fieldLabel(kindDef)}</span>
					<select id={kindId} value={ref.kind || 'other'} onchange={(e) => setKind(e.currentTarget.value)}>
						{#each options as k (k)}<option value={k}>{label(k)}</option>{/each}
					</select>
				</label>
			</div>
			{#each FIELDS as f (f.key)}
				<FieldRow scope="reference" field={f} value={(ref as Record<string, unknown>)[f.key]} units={settings.value.units} onsave={(v) => save(f.key, v, fieldLabel(f.def))} />
			{/each}
		</Section>
		<Section footer={t('references.delete.footer')}>
			<Row title={t('references.delete')} destructive onclick={remove} />
		</Section>
	{/if}
</Sheet>

<style>
	.pick {
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.cell {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: var(--touch, 44px);
		padding: 0 16px;
	}
	.label {
		flex: none;
		width: 38%;
		max-width: 190px;
		font-size: 17px;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	select {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		min-height: var(--touch, 44px);
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		color: var(--tint);
		font-size: 17px;
		letter-spacing: -0.43px;
		outline: none;
		cursor: pointer;
	}
	select option {
		color: initial;
	}
</style>
