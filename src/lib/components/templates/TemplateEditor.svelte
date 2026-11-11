<script lang="ts">
	// One template: its name and the fields it sets, edited as a draft, and the entries linked to
	// it. Save with no linked entry to change saves at once; otherwise it opens the review, where
	// the person picks how far the edit reaches. Template and entries change as one undo. While
	// nothing is typed, the draft follows the store, so an undo shows at once.
	import { untrack } from 'svelte';
	import { LayoutTemplate } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import Columns from '$lib/components/ios/Columns.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { live, liveRecord } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { applyTemplateEdit, previewTemplateEdit, type TemplateEditMode } from '$lib/model/template';
	import type { Slate, Take } from '$lib/model/types';
	import { sameValue } from '$lib/model/value';
	import FieldRow from '$lib/components/slates/FieldRow.svelte';
	import { provideRefs } from '$lib/components/slates/refs.svelte';
	import { diverged } from '$lib/templates/divergence';
	import { templateFields } from '$lib/templates/fields';
	import { templateEditPatch } from '$lib/templates/list';
	import { templateReview } from '$lib/templates/review';
	import { deleteTemplate, duplicateTemplate } from './actions';
	import ReviewSheet from './ReviewSheet.svelte';

	let { id }: { id: string } = $props();

	const app = useApp();
	const refs = provideRefs();
	const record = liveRecord('template', () => id);
	const tp = $derived(record.value);
	const units = $derived(settings.value.units);

	// The entries linked to it, and the names to show them by.
	type Linked = { records: (Slate | Take)[]; names: Map<string, string>; slateOf: Map<string, string> };
	const linked = live<Linked>(
		['slate', 'take'],
		async (store) => {
			const me = id;
			const scope = record.value?.scope;
			if (!scope) return { records: [], names: new Map(), slateOf: new Map() };
			const slates = await store.list('slate');
			const slateName = new Map(slates.map((s) => [s.id, s.slateUID ?? '']));
			if (scope === 'slate') {
				const records = slates.filter((s) => s.templateId === me);
				return { records, names: new Map(records.map((s) => [s.id, t('slates.slate', { slate: s.slateUID ?? '' })])), slateOf: new Map(records.map((s) => [s.id, s.id])) };
			}
			const records = (await store.list('take')).filter((tk) => tk.templateId === me);
			const names = new Map(
				records.map((tk) => {
					const cam = tk.cameraSetupId ? (refs.names.get(tk.cameraSetupId) ?? '') : '';
					const take = cam ? t('slates.take.title.camera', { take: tk.take ?? '', camera: cam }) : t('slates.take.title', { take: tk.take ?? '' });
					return [tk.id, `${t('slates.slate', { slate: slateName.get(tk.slateId) ?? '' })} · ${take}`];
				})
			);
			return { records, names, slateOf: new Map(records.map((tk) => [tk.id, tk.slateId])) };
		},
		{ records: [], names: new Map(), slateOf: new Map() }
	);

	// The draft. It follows the store until something is typed.
	let name = $state('');
	let values = $state<Record<string, unknown>>({});
	let base: { name: string; values: object } | undefined;
	$effect(() => {
		const r = tp;
		if (!r) return;
		untrack(() => {
			const dirtyNow = base ? base.name !== name.trim() || !sameValue(base.values, values) : false;
			if (!base || !dirtyNow) {
				name = r.name;
				values = structuredClone($state.snapshot(r.values)) as Record<string, unknown>;
			}
			base = { name: r.name, values: r.values };
		});
	});
	const patch = $derived(tp ? templateEditPatch(tp, name, values) : []);
	const dirty = $derived(patch.length > 0 && name.trim() !== '');
	const FIELDS = $derived(tp ? templateFields(tp.scope) : []);

	function set(key: string, value: unknown) {
		const next = { ...values };
		if (value === undefined) delete next[key];
		else next[key] = value;
		values = next;
	}

	let reviewOpen = $state(false);
	const review = $derived(tp ? templateReview(previewTemplateEdit(linked.value.records, tp, { id: tp.id, values })) : templateReview([]));

	async function commit(mode: TemplateEditMode) {
		const r = tp;
		if (!r) return;
		const draft = { id: r.id, values: $state.snapshot(values) };
		const entries = applyTemplateEdit(linked.value.records, r, draft, mode).patch;
		const templatePatch = templateEditPatch(r, name, draft.values);
		await app.edit.group({ key: 'templates.saved', params: { name: name.trim() } }, async () => {
			await app.edit.apply('template', templatePatch);
			if (entries.length) await app.edit.apply(r.scope, entries);
		});
	}
	async function save() {
		if (!dirty) return;
		if (review.all.fields === 0) await commit('all');
		else reviewOpen = true;
	}
	function discard() {
		if (!tp) return;
		name = tp.name;
		values = structuredClone(tp.values) as Record<string, unknown>;
	}
	async function duplicate() {
		if (!tp) return;
		const copy = await duplicateTemplate(app, tp, refs.templates.map((x) => x.name));
		await goto(`/templates/${copy.id}`);
	}
	async function remove() {
		if (!tp) return;
		await deleteTemplate(app, tp, linked.value.records);
		await goto('/templates');
	}
	const changedHere = (r: Slate | Take) => (tp ? diverged(tp, r).length : 0);
	const deleteFooter = $derived.by(() => {
		const n = linked.value.records.length;
		return n === 0 ? t('templates.delete.footer.none') : n === 1 ? t('templates.delete.footer.one') : t('templates.delete.footer.many', { n });
	});
</script>

<Page width="columns">
	<NavBar title={tp?.name ?? (record.ready ? t('templates.title') : '')} large back={{ href: '/templates', label: t('templates.title') }}>
		{#snippet trailing()}
			{#if tp}<Button variant="plain" class="strong" disabled={!dirty} onclick={save}>{t('templates.edit.save')}</Button>{/if}
		{/snippet}
	</NavBar>
	{#if tp}
		<p class="kind">{tp.scope === 'slate' ? t('templates.edit.kind.slate') : t('templates.edit.kind.take')}</p>
		<Columns>
			<div>
				<Section>
					<InputRow label={t('templates.edit.name')} bind:value={name} error={name.trim() === '' ? t('validation.required') : undefined} />
				</Section>
				<Section header={t('templates.edit.fields')} footer={t('templates.edit.fields.footer')}>
					{#each FIELDS as f (f.key)}
						<FieldRow scope={tp.scope} field={f} value={values[f.key]} {units} tri options={refs.options(f.def.key)} onsave={(v) => set(f.key, v)} />
					{/each}
				</Section>
			</div>
			<div>
				<Section header={t('templates.edit.linked')} footer={t('templates.edit.linked.footer')}>
					{#each linked.value.records as r (r.id)}
						{@const n = changedHere(r)}
						<Row title={linked.value.names.get(r.id) ?? ''} detail={n ? t('templates.edit.changedHere', { n }) : undefined} href="/slates/{linked.value.slateOf.get(r.id)}" />
					{:else}
						<Row title={t('templates.edit.linked.none')} class="quiet" />
					{/each}
				</Section>
				<Section>
					<Row title={t('templates.duplicate')} class="tint" onclick={duplicate} />
				</Section>
				<Section footer={deleteFooter}>
					<Row title={t('templates.delete')} destructive onclick={remove} />
				</Section>
			</div>
		</Columns>
	{:else if record.ready}
		<EmptyState icon={LayoutTemplate} title={t('templates.missing')} message={t('templates.missing.message')}>
			{#snippet action()}<Button variant="filled" href="/templates">{t('templates.title')}</Button>{/snippet}
		</EmptyState>
	{/if}

	{#snippet accessory()}
		{#if dirty}
			<div class="draft material-bar" role="toolbar" aria-label={t('templates.edit.unsaved')}>
				<span class="state">{t('templates.edit.unsaved')}</span>
				<Button variant="plain" onclick={discard}>{t('templates.edit.discard')}</Button>
				<Button variant="filled" onclick={save}>{t('templates.edit.save')}</Button>
			</div>
		{/if}
	{/snippet}
</Page>

{#if tp}
	<ReviewSheet bind:open={reviewOpen} {review} scope={tp.scope} names={refs.names} entryName={(rid) => linked.value.names.get(rid) ?? ''} onsave={commit} />
{/if}

<style>
	.kind {
		padding: 0 calc(var(--page-margin, 16px) + var(--title-inset, 0px));
		margin-block: -6px 16px;
		font-size: 15px;
		color: var(--label-2);
	}
	.draft {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 8px var(--page-margin, 16px) calc(8px + var(--safe-bottom));
		box-shadow: 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.state {
		margin-right: auto;
		font-size: 15px;
		font-weight: 600;
		color: var(--changed);
	}
</style>
