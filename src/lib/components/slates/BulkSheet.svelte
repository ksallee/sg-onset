<script lang="ts">
	// Bulk edit of the selected takes. Pick a field (the marks first), then set a value or clear
	// it; the page says how many takes change and how many already hold it before anything is
	// applied. Or link the takes to a take template. Each apply is the model's patch through the
	// editor: one undo. The sheet closes after; the selection stays for the next edit.
	import { ChevronRight } from '@lucide/svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import SearchField from '$lib/components/ios/SearchField.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import SheetPage from '$lib/components/ios/SheetPage.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import { fieldLabel } from '$lib/i18n/modelText';
	import { bulkEdit } from '$lib/model/bulkEdit';
	import type { TemplateRecord } from '$lib/model/template';
	import type { Take } from '$lib/model/types';
	import { sameValue } from '$lib/model/value';
	import { bulkFields, bulkPreview, linkPreview, MARKS } from '$lib/slates/bulk';
	import type { FieldRef } from '$lib/slates/fields';
	import FieldRow from './FieldRow.svelte';
	import { useRefs } from './refs.svelte';
	import { valueText } from './values';

	let { open = $bindable(false), takes, ids }: { open?: boolean; takes: Take[]; ids: string[] } = $props();

	const app = useApp();
	const refs = useRefs();
	const units = $derived(settings.value.units);
	const chosen = $derived(takes.filter((tk) => ids.includes(tk.id)));
	const n = $derived(chosen.length);
	const title = $derived(n === 1 ? t('slates.bulk.title.one') : t('slates.bulk.title.many', { n }));

	const ALL = bulkFields();
	const marks = ALL.filter((f) => (MARKS as readonly string[]).includes(f.key));
	let query = $state('');
	const others = $derived(ALL.filter((f) => !(MARKS as readonly string[]).includes(f.key) && fieldLabel(f.def, f.end).toLowerCase().includes(query.trim().toLowerCase())));

	/** What the chosen takes hold in a field: the value when they agree, "Mixed" when not. */
	function holds(f: FieldRef): string {
		const values = chosen.map((tk) => (tk as Record<string, unknown>)[f.key]);
		if (values.length === 0) return '';
		if (values.every((v) => sameValue(v, values[0]))) return valueText(f, values[0], units, refs.names);
		return t('slates.bulk.mixed');
	}

	// The field page.
	let field = $state<FieldRef | null>(null);
	let fieldOpen = $state(false);
	let mode = $state<'set' | 'clear'>('set');
	let pending = $state<{ ok: true; value: unknown } | { ok: false }>({ ok: false });
	function pick(f: FieldRef) {
		field = f;
		mode = 'set';
		pending = f.def.type === 'boolean' ? { ok: true, value: true } : { ok: false };
		fieldOpen = true;
	}
	const target = $derived(mode === 'clear' ? { ok: true as const, value: undefined } : pending.ok && pending.value !== undefined ? pending : null);
	const preview = $derived(field && target ? bulkPreview(chosen, ids, field.key, target.value) : null);
	const applyLabel = $derived.by(() => {
		const c = preview?.change.length ?? 0;
		if (!preview || c === 0) return t('slates.bulk.apply.nothing');
		if (mode === 'clear') return c === 1 ? t('slates.bulk.apply.clear.one') : t('slates.bulk.apply.clear', { n: c });
		return c === 1 ? t('slates.bulk.apply.set.one') : t('slates.bulk.apply.set', { n: c });
	});
	const previewText = $derived.by(() => {
		if (!preview) return '';
		const c = preview.change.length;
		const a = preview.already.length;
		const change = c === 0 ? t('slates.bulk.preview.change.none') : c === 1 ? t('slates.bulk.preview.change.one') : t('slates.bulk.preview.change.many', { n: c });
		if (a === 0) return change;
		const key = mode === 'clear' ? 'slates.bulk.preview.alreadyClear' : 'slates.bulk.preview.already';
		return `${change} ${a === 1 ? tk(`${key}.one`) : tk(`${key}.many`, { n: a })}`;
	});

	async function apply() {
		if (!field || !target || !preview?.change.length) return;
		const { patch } = bulkEdit(chosen, ids, field.key as keyof Take & string, target.value as never);
		const label = { key: mode === 'clear' ? 'slates.bulk.done.clear' : 'slates.bulk.done.set', params: { field: fieldLabel(field.def, field.end), n: patch.length } };
		await app.edit.apply('take', patch, label);
		fieldOpen = false;
		open = false;
	}

	// The template page.
	let templatesOpen = $state(false);
	const takeTemplates = $derived(refs.templates.filter((tp) => tp.scope === 'take'));
	async function link(tp: TemplateRecord) {
		const { patch, change } = linkPreview(chosen, ids, tp);
		if (!patch.length) return;
		await app.edit.apply('take', patch, { key: 'slates.bulk.done.link', params: { n: change.length, template: tp.name } });
		templatesOpen = false;
		open = false;
	}
	const linkDetail = (tp: TemplateRecord) => {
		const c = linkPreview(chosen, ids, tp).change.length;
		return c === 0 ? t('slates.bulk.apply.nothing') : c === 1 ? t('slates.bulk.apply.link.one') : t('slates.bulk.apply.link', { n: c });
	};

	$effect(() => {
		if (!open) {
			fieldOpen = false;
			templatesOpen = false;
			query = '';
		}
	});
</script>

<Sheet bind:open {title} done>
	<Section header={t('slates.bulk.marks')}>
		{#each marks as f (f.key)}
			<Row title={fieldLabel(f.def)} detail={holds(f)} chevron onclick={() => pick(f)} />
		{/each}
	</Section>
	<Section header={t('slates.bulk.template')} footer={t('slates.bulk.link.footer')}>
		<Row title={t('slates.bulk.template.use')} chevron onclick={() => (templatesOpen = true)} />
	</Section>
	<div class="search"><SearchField bind:value={query} placeholder={t('slates.bulk.search')} label={t('slates.bulk.search')} /></div>
	<Section header={t('slates.bulk.fields')}>
		{#each others as f (f.key)}
			<Row title={fieldLabel(f.def, f.end)} detail={holds(f)} chevron onclick={() => pick(f)} />
		{/each}
	</Section>

	<SheetPage bind:open={fieldOpen} title={field ? fieldLabel(field.def, field.end) : ''}>
		{#if field}
			<div class="mode">
				<Segmented
					label={t('slates.bulk.value')}
					options={[
						{ value: 'set', label: t('slates.bulk.set') },
						{ value: 'clear', label: t('slates.bulk.clear') }
					]}
					value={mode}
					onchange={(v) => (mode = v as 'set' | 'clear')}
				/>
			</div>
			{#if mode === 'set'}
				<Section>
					{#key field.key}
						<FieldRow
							scope="take"
							{field}
							value={pending.ok ? pending.value : undefined}
							{units}
							tri
							options={refs.options(field.def.key)}
							onlive={(read) => (pending = read)}
							onsave={(v) => (pending = { ok: true, value: v })}
						/>
					{/key}
				</Section>
			{/if}
			<p class="preview" aria-live="polite">{previewText}</p>
			<div class="apply">
				<Button variant="filled" size="large" full destructive={mode === 'clear'} disabled={!preview?.change.length} onclick={apply}>{applyLabel}</Button>
			</div>
		{/if}
	</SheetPage>

	<SheetPage bind:open={templatesOpen} title={t('slates.bulk.template.use')}>
		<Section footer={t('slates.bulk.link.footer')}>
			{#each takeTemplates as tp (tp.id)}
				<Row title={tp.name} detail={linkDetail(tp)} onclick={() => link(tp)}>
					{#snippet trailing()}<ChevronRight class="size-[18px] opacity-40" />{/snippet}
				</Row>
			{:else}
				<Row title={t('slates.bulk.template.none')} class="quiet" />
			{/each}
		</Section>
	</SheetPage>
</Sheet>

<style>
	.search {
		padding: 0 var(--page-margin, 16px);
		margin-block: 4px -8px;
	}
	.mode {
		padding: 16px var(--page-margin, 16px) 0;
	}
	.preview {
		min-height: 20px;
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		margin-block: 8px 16px;
		font-size: 15px;
		line-height: 20px;
		color: var(--label-2);
	}
	.apply {
		padding: 0 var(--page-margin, 16px) 24px;
	}
</style>
