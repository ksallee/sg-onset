<script lang="ts">
	// Cameras or lenses from a CSV file or pasted text. Nothing is saved until Import: first the
	// preview, from the model's report: the rows that will import, those with a value left out,
	// those left out and why, the duplicates of gear already here, and the columns read and not
	// read. Import saves every entry as one edit, so one Undo takes the whole import back.
	import { CircleAlert, CircleCheck, CircleX, Copy, Download, FileUp, X } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/ios/Button.svelte';
	import Columns from '$lib/components/ios/Columns.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import Toolbar from '$lib/components/ios/Toolbar.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { findField } from '$lib/model/catalogue';
	import { fieldLabel, importIssueText } from '$lib/i18n/modelText';
	import { t, tk } from '$lib/i18n/messages';
	import { gearTitle, type GearScope } from '$lib/gear/names';
	import { columnsRead, previewImport, recordsToImport, type DuplicateChoice, type PreviewRow } from '$lib/gear/preview';
	import { sampleCsv, sampleFileName, samplePlaceholder } from '$lib/gear/sampleCsv';
	import { countText, rowIssueText } from '$lib/gear/text';

	const app = useApp();
	const current = useCurrent();
	const projectId = $derived(current.project!.id);
	const scope = $derived<GearScope>(page.url.searchParams.get('kind') === 'lens' ? 'lens' : 'camera');
	const existingCameras = liveList('camera', () => current.project?.id);
	const existingLenses = liveList('lens', () => current.project?.id);

	let text = $state('');
	let fileName = $state('');
	let readError = $state(false);
	let duplicates = $state<DuplicateChoice>('skip');
	let saving = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	// Ids are made once per preview; the records saved are the ones shown.
	const preview = $derived(previewImport(scope, text, scope === 'camera' ? existingCameras.value : existingLenses.value, { projectId, newId: () => app.newId() }));
	const toSave = $derived(recordsToImport(preview, duplicates));
	const columns = $derived(columnsRead(preview.report));
	const hasText = $derived(text.trim() !== '');

	function setKind(kind: string) {
		void goto(`/gear/import?kind=${kind}`, { replaceState: true, noScroll: true, keepFocus: true });
	}

	async function choose(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			text = await file.text();
			fileName = file.name;
			readError = false;
		} catch {
			readError = true;
		}
		(event.currentTarget as HTMLInputElement).value = '';
	}

	function downloadSample() {
		const blob = new Blob([sampleCsv(scope)], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = sampleFileName(scope);
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function clear() {
		text = '';
		fileName = '';
		readError = false;
	}

	async function commit() {
		const records = toSave;
		if (!records.length || saving) return;
		saving = true;
		try {
			await app.edit.group({ key: 'import.done', params: { what: countText(scope, records.length) } }, async () => {
				for (const record of records) await app.edit.create(scope, record);
			});
			await goto('/gear');
		} finally {
			saving = false;
		}
	}

	const kinds = [
		{ value: 'camera', label: t('gear.cameras') },
		{ value: 'lens', label: t('gear.lenses') }
	];

	function rowTitle(row: PreviewRow): string {
		return row.record ? gearTitle(scope, row.record) || t('import.row', { row: row.row }) : t('import.row.left');
	}
	function rowLine(row: PreviewRow): string | undefined {
		const said = row.issues.map((i) => rowIssueText(i));
		if (row.status === 'duplicate') {
			const what = row.within ? t('import.row.duplicateWithin', { row: preview.rows.find((r) => r.record?.id === row.duplicateOf)?.row ?? '' }) : t('import.row.duplicate');
			said.unshift(duplicates === 'skip' ? `${what} · ${t('import.row.skipped')}` : what);
		}
		return said.join(' ') || undefined;
	}
	const label = (key: string) => {
		const found = findField(scope, key);
		return found ? fieldLabel(found.def) : key;
	};
</script>

<svelte:head><title>{t('import.title')} · {t('app.name')}</title></svelte:head>

<Page width="columns">
	<NavBar title={t('import.title')} back={{ href: '/gear', label: t('gear.title') }} />

	<Columns>
		<div>
			<Section header={t('import.kind')}>
				<div class="kind"><Segmented options={kinds} value={scope} onchange={setKind} label={t('import.kind')} /></div>
			</Section>

			<Section header={t('import.source')} footer={readError ? t('import.readError') : undefined}>
				<Row title={fileName || t('import.choose')} subtitle={fileName ? t('import.choose') : undefined} class={fileName ? '' : 'tint'} onclick={() => input?.click()}>
					{#snippet leading()}<span class="icon tint" aria-hidden="true"><FileUp class="size-[19px]" strokeWidth={2.1} /></span>{/snippet}
				</Row>
				{#if hasText}
					<Row title={t('import.clear')} class="tint" onclick={clear}>
						{#snippet leading()}<span class="icon tint" aria-hidden="true"><X class="size-[19px]" strokeWidth={2.1} /></span>{/snippet}
					</Row>
				{/if}
			</Section>
			<input bind:this={input} class="file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" onchange={choose} tabindex="-1" aria-hidden="true" />

			<Section header={t('import.paste')} footer={t('import.paste.footer')}>
				<div class="paste">
					<textarea bind:value={text} placeholder={samplePlaceholder(scope)} aria-label={t('import.paste')} spellcheck="false" autocapitalize="off" autocomplete="off" rows="7"></textarea>
				</div>
			</Section>

			<Section footer={t('import.sample.footer')}>
				<Row title={t('import.sample')} class="tint" onclick={downloadSample}>
					{#snippet leading()}<span class="icon tint" aria-hidden="true"><Download class="size-[19px]" strokeWidth={2.1} /></span>{/snippet}
				</Row>
			</Section>

		</div>

		<div>
			<Section header={t('import.summary')} footer={hasText ? undefined : t('import.summary.empty')}>
				{#each preview.fileIssues as issue (issue.key)}
					<Row title={importIssueText(issue)} class="problem">
						{#snippet leading()}<span class="icon red" aria-hidden="true"><CircleX class="size-[20px]" strokeWidth={2} /></span>{/snippet}
					</Row>
				{/each}
				{#if hasText && !preview.fileIssues.length}
					<Row title={t('import.summary.rows')} detail={String(preview.counts.rows)} />
					<Row title={t('import.summary.ready')} detail={String(preview.counts.ready)} />
					{#if preview.counts.warning}<Row title={t('import.summary.warning')} detail={String(preview.counts.warning)} />{/if}
					{#if preview.counts.dropped}<Row title={t('import.summary.dropped')} detail={String(preview.counts.dropped)} />{/if}
					{#if preview.counts.duplicate}<Row title={t('import.summary.duplicate')} detail={String(preview.counts.duplicate)} />{/if}
				{/if}
			</Section>

			{#if preview.counts.duplicate}
				<Section header={t('import.duplicates')} footer={t('import.duplicates.footer')}>
					<div class="kind">
						<Segmented
							options={[
								{ value: 'skip', label: t('import.duplicates.skip') },
								{ value: 'add', label: t('import.duplicates.add') }
							]}
							value={duplicates}
							onchange={(v) => (duplicates = v as DuplicateChoice)}
							label={t('import.duplicates')}
						/>
					</div>
				</Section>
			{/if}

			{#if preview.rows.length}
				<Section header={t('import.rows')}>
					{#each preview.rows as row (row.row)}
						<Row title={rowTitle(row)} subtitle={rowLine(row) ?? t('import.row.ready')} detail={t('import.row', { row: row.row })} class="import-row {row.status}">
							{#snippet leading()}
								{#if row.status === 'ready'}<span class="icon ok" aria-label={t('import.summary.ready')}><CircleCheck class="size-[20px]" strokeWidth={2} /></span>
								{:else if row.status === 'warning'}<span class="icon warn" aria-label={t('import.summary.warning')}><CircleAlert class="size-[20px]" strokeWidth={2} /></span>
								{:else if row.status === 'dropped'}<span class="icon red" aria-label={t('import.summary.dropped')}><CircleX class="size-[20px]" strokeWidth={2} /></span>
								{:else}<span class="icon quiet" aria-label={t('import.summary.duplicate')}><Copy class="size-[19px]" strokeWidth={2} /></span>{/if}
							{/snippet}
						</Row>
					{/each}
				</Section>
			{/if}
			{#if preview.report.headerRow !== null}
				<Section header={t('import.columns')} footer={t('import.columns.headerRow', { row: preview.report.headerRow })}>
					{#each columns as column (column.header)}
						<Row title={column.header} detail={label(column.key)} />
					{/each}
					{#if preview.report.ignoredColumns.length}
						<Row title={t('import.columns.ignored', { headers: preview.report.ignoredColumns.join(', ') })} class="quiet" />
					{/if}
				</Section>
			{/if}
		</div>
	</Columns>

	{#snippet accessory()}
		<Toolbar label={t('import.title')}>
			<Button variant="plain" href="/gear">{t('common.cancel')}</Button>
			<Button variant="filled" disabled={!toSave.length || saving} onclick={commit}>
				{toSave.length ? tk(`import.commit.${scope}.${toSave.length === 1 ? 'one' : 'other'}`, { n: toSave.length }) : t('import.commit.none')}
			</Button>
		</Toolbar>
	{/snippet}
</Page>

<style>
	.kind {
		padding: 8px 12px;
		background: var(--group-bg, var(--cell));
	}
	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.paste {
		background: var(--group-bg, var(--cell));
	}
	textarea {
		display: block;
		width: 100%;
		min-height: 150px;
		padding: 12px 16px;
		background: transparent;
		color: var(--label);
		font: 15px/20px ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: max(16px, 15px);
		resize: vertical;
		outline: none;
	}
	/* The browser draws the resize grip in grey, whatever the colours: none in red night. */
	:global(html[data-night='true']) textarea {
		resize: none;
	}
	textarea::placeholder {
		color: var(--label-3);
	}
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 29px;
		height: 29px;
	}
	.icon.tint {
		color: var(--tint);
	}
	.icon.ok {
		color: var(--good);
	}
	.icon.warn {
		color: var(--warning);
	}
	.icon.red {
		color: var(--destructive);
	}
	.icon.quiet {
		color: var(--label-2);
	}
	:global(.ios-row.import-row .subtitle) {
		white-space: normal;
	}
	:global(.ios-row.import-row.dropped .title),
	:global(.ios-row.import-row.duplicate .title) {
		color: var(--label-2);
	}
	:global(.ios-row.problem .title) {
		white-space: normal;
		color: var(--destructive);
	}
</style>
