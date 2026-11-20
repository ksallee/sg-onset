<script lang="ts">
	// The names an admin picks (#111), a page of the sync sheet: each custom entity and each field the
	// app wants, kept, renamed, or a field of the site; a prefix for all at once; a file out and in;
	// then the review before Set Up Fields, which keeps them on the Flow PT project. Once the project
	// has synced, what is in use stays as it is (Kevin, #111). The view is app/sync/names.ts; the
	// reads and writes are lib/fpt/setup.ts. Nothing reaches Flow PT before the review's tap.
	import Button from '$lib/components/ios/Button.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import SheetPage from '$lib/components/ios/SheetPage.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { changeLines, draftReport, editableFields, importNames, namesFileName, namesView, problemLines, type EntityRow, type FieldRow } from '$lib/app/sync/names';
	import { setupView } from '$lib/app/sync/report';
	import { setupReview } from '$lib/app/sync/review';
	import { readNaming, withEntity, withField, withPrefix, writeNaming, type Naming } from '$lib/fpt/naming';
	import type { NamesOutcome, NamesReview } from '$lib/fpt/setup';
	import { t } from '$lib/i18n/messages';
	import SetupReview from './SetupReview.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const sync = useSync();
	let review = $state.raw<NamesReview | undefined>();
	let reading = $state(false);
	let failed = $state(false);
	let draft = $state.raw<Naming>({});
	let prefix = $state('');
	let said = $state('');
	let reviewing = $state(false);

	async function load() {
		reading = true;
		failed = false;
		const read = await sync.names();
		reading = false;
		if (!read) {
			failed = true;
			return;
		}
		review = read;
		draft = read.named.naming;
	}
	$effect(() => {
		if (open && !review && !reading && !failed) void load();
		if (!open) {
			review = undefined;
			failed = false;
			reviewing = false;
			said = '';
		}
	});

	const view = $derived(review ? namesView(review, draft) : undefined);
	const problems = $derived(view ? problemLines(view, draft) : []);
	const link = $derived(sync.state.link);
	// The name chosen under the app's own, then where it is and its state: the right side says only Changed.
	const entitySub = (e: EntityRow) => [e.name !== e.defaultName ? e.name : '', e.entityType, t(`sync.names.entity.${e.status}`), e.locked ? t('sync.names.status.locked') : ''].filter(Boolean).join(' · ');
	const fieldSub = (f: FieldRow) => [f.choice === 'keep' ? '' : f.shown, f.name, f.locked ? t('sync.names.status.locked') : t(`sync.names.status.${f.status}`), f.reason ?? ''].filter(Boolean).join(' · ');
	/** What saving the names came to, in a line. Unchanged says nothing: Set Up Fields ran as before. */
	function outcomeText(outcome: NamesOutcome, reason = ''): string {
		if (outcome === 'failed') return t('sync.names.failed', { reason });
		if (outcome === 'unreadable') return t('sync.names.unreadable');
		if (outcome === 'unchanged') return '';
		return t(`sync.names.${outcome}`);
	}
	const editable = (locked: boolean) => !!view && !view.readOnly && !locked;

	// ---------------------------------------------------------------- an entity
	let entityOpen = $state(false);
	let entityRow = $state.raw<EntityRow | undefined>();
	let entityText = $state('');
	function openEntity(e: EntityRow) {
		entityRow = e;
		entityText = e.name;
		entityOpen = true;
	}
	function nameEntity(name: string) {
		if (!entityRow) return;
		draft = withEntity(draft, entityRow.scope, name);
		entityText = name || entityRow.defaultName;
	}

	// ---------------------------------------------------------------- a field
	let fieldOpen = $state(false);
	let fieldKey = $state('');
	let renameText = $state('');
	const field = $derived(view?.groups.flatMap((g) => g.fields).find((f) => f.key === fieldKey));
	function openField(f: FieldRow) {
		fieldKey = f.key;
		renameText = f.choice === 'rename' ? f.display : '';
		fieldOpen = true;
	}
	function choose(choice: Parameters<typeof withField>[3]) {
		if (field) draft = withField(draft, field.place, field.column, choice);
	}

	// ---------------------------------------------------------------- the file
	let picker = $state<HTMLInputElement>();
	function exportNames() {
		const blob = new Blob([writeNaming(draft)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = namesFileName(link?.name ?? '');
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	async function picked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !view) return;
		const read = readNaming(await file.text().catch(() => ''));
		if (!read.ok) {
			said = t('sync.names.import.bad');
			return;
		}
		const done = importNames(view, draft, read.naming);
		draft = done.naming;
		said = done.kept ? t(`sync.names.import.kept.${done.kept === 1 ? 'one' : 'other'}`, { n: done.kept }) : '';
	}

	// ---------------------------------------------------------------- the review
	const pending = $derived(
		review && link
			? setupReview(setupView({ ...draftReport(review, link.site, draft), ...(sync.state.report?.action ? { action: sync.state.report.action } : {}) }), {
					site: link.site,
					project: link.name || String(link.projectId)
				})
			: undefined
	);
	let top = $state<HTMLElement>();
	async function confirm() {
		reviewing = false;
		const done = await sync.saveNames(draft);
		if (!done) return;
		said = outcomeText(done.outcome, done.reason);
		// The line says what came of it: bring it into view.
		top?.scrollIntoView({ block: 'start' });
		const read = await sync.names();
		if (read) {
			review = read;
			if (done.outcome === 'saved') draft = read.named.naming;
		}
	}
</script>

<SheetPage bind:open title={t('sync.names.title')}>
	{#if reviewing && pending && view}
		<SetupReview review={pending} names={changeLines(view)} onconfirm={() => void confirm()} onnotnow={() => (reviewing = false)} />
	{:else if !view}
		<Section footer={failed ? t('sync.names.readFailed') : undefined}>
			{#if failed}
				<Row title={t('sync.names.retry')} onclick={() => void load()} chevron={false} />
			{:else}
				<Row title={t('sync.names.reading')} />
			{/if}
		</Section>
	{:else}
		<div bind:this={top} class="top">
			<Section footer={view.unreadable ? t('sync.names.unreadable') : view.readOnly ? t('sync.names.readOnly') : view.synced ? t('sync.names.synced') : t('sync.names.intro')}>
				{#if said}<Row title={said} />{/if}
			</Section>
		</div>

		<Section header={t('sync.names.entities')} footer={t('sync.names.entities.footer')}>
			{#each view.entities as e (e.scope)}
				<Row title={e.defaultName} detail={e.changed ? t('sync.names.changed') : undefined} subtitle={entitySub(e)} onclick={editable(e.locked) ? () => openEntity(e) : undefined} />
			{/each}
		</Section>

		{#if !view.readOnly && editableFields(view).length}
			<Section header={t('sync.names.prefix')} footer={t('sync.names.prefix.footer')}>
				<InputRow label={t('sync.names.prefix.label')} bind:value={prefix} autocapitalize="words" />
				<Row title={t('sync.names.prefix.apply')} onclick={() => (draft = withPrefix(draft, prefix, editableFields(view)))} chevron={false} />
			</Section>
		{/if}

		{#each view.groups as g (g.place)}
			<Section header={g.entity}>
				{#each g.fields as f (f.key)}
					<Row title={f.column.display} detail={f.changed ? t('sync.names.changed') : undefined} subtitle={fieldSub(f)} onclick={editable(f.locked) ? () => openField(f) : undefined} />
				{/each}
			</Section>
		{/each}

		{#if problems.length}
			<Section header={t('sync.names.problems')}>
				{#each problems as line (line)}<Row title={line} />{/each}
			</Section>
		{/if}

		<Section header={t('sync.names.file')} footer={t('sync.names.file.footer')}>
			<Row title={t('sync.names.export')} onclick={exportNames} chevron={false} />
			{#if !view.readOnly}<Row title={t('sync.names.import')} onclick={() => picker?.click()} chevron={false} />{/if}
		</Section>
		<input class="picker" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true" bind:this={picker} onchange={picked} />

		{#if !view.readOnly}
			<div class="actions">
				<Button variant="filled" size="large" full disabled={!view.canReview || sync.state.checking} onclick={() => (reviewing = true)}>{t('sync.names.review')}</Button>
				{#if view.changes > 0}
					<Button variant="plain" size="large" full onclick={() => (draft = review?.named.naming ?? {})}>{t('sync.names.discard')}</Button>
				{/if}
			</div>
		{/if}
	{/if}

	<SheetPage bind:open={entityOpen} title={entityRow?.defaultName ?? ''}>
		{#if entityRow && view}
			<Section footer={t('sync.names.entities.footer')}>
				<InputRow label={t('sync.names.entity.name')} bind:value={entityText} onchange={nameEntity} autocapitalize="words" />
			</Section>
			<Section header={t('sync.names.entity.site')} footer={t('sync.names.entity.site.footer')}>
				{#each view.siteEntities as name (name)}
					<Row title={name} checked={name.toLowerCase() === entityText.trim().toLowerCase()} onclick={() => nameEntity(name)} chevron={false} />
				{/each}
			</Section>
		{/if}
	</SheetPage>

	<SheetPage bind:open={fieldOpen} title={field?.column.display ?? ''}>
		{#if field}
			<Section>
				<Row title={t('sync.names.choice.keep')} subtitle={field.column.display} checked={field.choice === 'keep'} onclick={() => choose(undefined)} chevron={false} />
				<Row title={t('sync.names.choice.rename')} checked={field.choice === 'rename'} chevron={false} />
				<InputRow label={t('sync.names.field.name')} bind:value={renameText} onchange={(text) => choose(text ? { display: text } : undefined)} autocapitalize="words" />
			</Section>
			<Section header={t('sync.names.choice.field')} footer={field.options.length ? t('sync.names.field.footer') : t('sync.names.field.none')}>
				{#each field.options as o (o.name)}
					<Row title={o.displayName} subtitle={o.name} checked={field.field === o.name} onclick={() => choose({ field: o.name })} chevron={false} />
				{/each}
			</Section>
		{/if}
	</SheetPage>
</SheetPage>

<style>
	.picker {
		display: none;
	}
	.top {
		scroll-margin-top: 16px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 8px var(--page-margin, 16px) 24px;
	}
</style>
