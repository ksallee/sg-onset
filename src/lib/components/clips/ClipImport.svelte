<script lang="ts">
	// The DIT's clips from an ALE or CSV file (#109), reached from the Slates list. Nothing is saved
	// until Fill: first the columns read, each clip with its take and how it was found, what it
	// fills, updates and keeps, the lens it names when the gear has none or two of it, and the
	// clips left over. A tap on a clip puts it on another take.
	// Fill writes the takes and what the import wrote as one edit, so one Undo takes it all back.
	// The rules are pure (lib/clips); this page only shows them.
	import { CircleAlert, CircleCheck, CircleDashed, FileText, FileUp } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import Columns from '$lib/components/ios/Columns.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Toolbar from '$lib/components/ios/Toolbar.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatTime } from '$lib/app/format';
	import { live, liveList } from '$lib/app/live.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import type { Take } from '$lib/model/types';
	import { applyClipImport } from '$lib/clips/apply';
	import { COLUMN_TARGETS, setColumn, type ColumnTarget } from '$lib/clips/columns';
	import type { Pick } from '$lib/clips/match';
	import { previewClips, type PreviewRow } from '$lib/clips/preview';
	import { clipLine, columnLabel, commitText, fieldLines, issueText, matchLine } from '$lib/clips/text';
	import { lensTitle } from '$lib/gear/names';
	import { dayTakeLines } from '$lib/slates/takes';
	import TakePicker from './TakePicker.svelte';

	const app = useApp();
	const current = useCurrent();
	const projectId = () => current.project?.id;
	const setups = liveList('cameraSetup', projectId);
	const lenses = liveList('lens', projectId);
	const imports = liveList('clipImport', () => current.shootDay?.id);
	const takes = live<Take[]>(
		['take'],
		async (store) => {
			const slates = current.slates;
			return (await Promise.all(slates.map((s) => store.list('take', s.id)))).flat();
		},
		[]
	);

	let text = $state('');
	let fileName = $state('');
	let readError = $state(false);
	let map = $state<Partial<Record<ColumnTarget, number>> | undefined>(undefined);
	let picks = $state<Pick[]>([]);
	let pickRow = $state<number | undefined>(undefined);
	let pickOpen = $state(false);
	let saving = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	const lines = $derived(dayTakeLines(current.slates, takes.value, setups.value, lenses.value));
	// The device's time zone at each take's stamp: what a camera's time of day timecode runs in.
	const offsetMinutes = (timestamp: string) => -new Date(timestamp).getTimezoneOffset();
	const preview = $derived(previewClips({ text, map, picks, lines, imports: imports.value, lenses: lenses.value, offsetMinutes }));
	const lensNames = $derived(new Map(lenses.value.map((l) => [l.id, lensTitle(l)])));
	const matched = $derived(preview.rows.filter((r) => r.line));
	const left = $derived(preview.rows.filter((r) => !r.line));
	const fileIssues = $derived(preview.read.issues.filter((i) => i.kind === 'noNameColumn' || i.kind === 'noRate'));
	const rowIssues = $derived(preview.read.issues.filter((i) => i.kind === 'noName' || i.kind === 'badTimecode' || i.kind === 'badValue'));
	const earlier = $derived([...imports.value].sort((a, b) => b.importedAt.localeCompare(a.importedAt)));
	const picked = $derived(preview.rows.find((r) => r.clip.row === pickRow));

	async function choose(event: Event) {
		const el = event.currentTarget as HTMLInputElement;
		const file = el.files?.[0];
		if (!file) return;
		try {
			text = await file.text();
			fileName = file.name;
			readError = false;
			map = undefined;
			picks = [];
		} catch {
			readError = true;
		}
		el.value = '';
	}

	function setMap(target: ColumnTarget, value: string) {
		map = setColumn(preview.map, target, value === '' ? undefined : Number(value));
	}

	function openPick(row: PreviewRow) {
		pickRow = row.clip.row;
		pickOpen = true;
	}

	function pick(takeId: string | null) {
		if (pickRow === undefined) return;
		picks = [...picks, { row: pickRow, takeId }];
		pickOpen = false;
	}

	async function commit() {
		const plan = preview.plan;
		const day = current.shootDay;
		if (!plan.counts.takes || saving || !day) return;
		saving = true;
		try {
			await applyClipImport(app, plan, { id: app.newId(), shootDayId: day.id, importedAt: new Date(app.now()).toISOString(), fileName });
			await goto('/slates');
		} finally {
			saving = false;
		}
	}

	const subtitle = (row: PreviewRow) => (row.line ? [matchLine(row.line, row.match.how ?? 'picked'), ...fieldLines(row.fields, { names: lensNames, lens: row.lens })] : [clipLine(row.clip)]).join('\n');
	const icon = (row: PreviewRow) => (!row.line ? 'left' : row.fields.some((f) => f.kind !== 'kept') ? 'fills' : 'same');
</script>

<svelte:head><title>{t('clips.title')} · {t('app.name')}</title></svelte:head>

<Page width="columns">
	<NavBar title={t('clips.title')} back={{ href: '/slates', label: t('slates.title') }} />
	<ContextBar />

	<Columns>
		<div>
			<Section header={t('clips.source')} footer={readError ? t('clips.readError') : t('clips.source.footer')}>
				{#if fileName}
					<Row title={fileName} subtitle={preview.sheet ? tk(`clips.file.${preview.sheet.format}`, { n: preview.sheet.rows.length }) : t('clips.noTable')}>
						{#snippet leading()}<span class="icon quiet" aria-hidden="true"><FileText class="size-[19px]" strokeWidth={2.1} /></span>{/snippet}
					</Row>
				{/if}
				<Row title={fileName ? t('clips.chooseAgain') : t('clips.choose')} class="tint" onclick={() => input?.click()}>
					{#snippet leading()}<span class="icon tint" aria-hidden="true"><FileUp class="size-[19px]" strokeWidth={2.1} /></span>{/snippet}
				</Row>
			</Section>
			<input bind:this={input} class="file" type="file" accept=".ale,.csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" onchange={choose} tabindex="-1" aria-hidden="true" />

			{#if preview.sheet}
				<Section header={t('clips.columns')} footer={t('clips.columns.footer')}>
					{#each COLUMN_TARGETS as target (target)}
						<div class="column" role="listitem">
							<label class="cell">
								<span class="label">{columnLabel(target)}</span>
								<select value={preview.map[target] === undefined ? '' : String(preview.map[target])} onchange={(e) => setMap(target, e.currentTarget.value)}>
									<option value="">{t('clips.columns.none')}</option>
									{#each preview.sheet.headers as header, i (i)}
										{#if header !== ''}<option value={String(i)}>{header}</option>{/if}
									{/each}
								</select>
							</label>
						</div>
					{/each}
				</Section>
			{/if}

			{#if earlier.length}
				<Section header={t('clips.earlier')} footer={t('clips.earlier.footer')}>
					{#each earlier as entry (entry.id)}
						{@const n = Object.keys(entry.filled).length}
						<Row title={t('clips.earlier.row', { time: formatTime(entry.importedAt), file: entry.fileName || t('clips.earlier.noFile') })} detail={tk(`clips.earlier.takes.${n === 1 ? 'one' : 'other'}`, { n })} />
					{/each}
				</Section>
			{/if}
		</div>

		<div>
			<Section header={t('clips.summary')} footer={preview.sheet ? t('clips.summary.footer') : t('clips.summary.empty')}>
				{#each fileIssues as issue, i (i)}
					<Row title={issueText(issue)} class="problem">
						{#snippet leading()}<span class="icon warn" aria-hidden="true"><CircleAlert class="size-[20px]" strokeWidth={2} /></span>{/snippet}
					</Row>
				{/each}
				{#if preview.sheet && preview.read.clips.length}
					{#if !lines.length}<Row title={t('clips.summary.noTakes')} class="problem" />{/if}
					<Row title={t('clips.summary.clips')} detail={String(preview.read.clips.length)} />
					<Row title={t('clips.summary.time')} detail={String(preview.counts.time)} />
					<Row title={t('clips.summary.order')} detail={String(preview.counts.order)} />
					{#if preview.counts.picked}<Row title={t('clips.summary.picked')} detail={String(preview.counts.picked)} />{/if}
					<Row title={t('clips.summary.left')} detail={String(preview.counts.left)} />
					<Row title={t('clips.summary.fill')} detail={String(preview.plan.counts.add)} />
					<Row title={t('clips.summary.update')} detail={String(preview.plan.counts.update)} />
					<Row title={t('clips.summary.kept')} detail={String(preview.plan.counts.kept)} />
				{/if}
			</Section>

			{#if matched.length}
				<Section header={t('clips.matches')} footer={t('clips.matches.footer')}>
					{#each matched as row (row.clip.row)}
						<Row title={row.clip.name} subtitle={subtitle(row)} chevron class="clip-row" onclick={() => openPick(row)}>
							{#snippet leading()}
								{#if icon(row) === 'fills'}<span class="icon ok" aria-hidden="true"><CircleCheck class="size-[20px]" strokeWidth={2} /></span>
								{:else}<span class="icon quiet" aria-hidden="true"><CircleDashed class="size-[20px]" strokeWidth={2} /></span>{/if}
							{/snippet}
						</Row>
					{/each}
				</Section>
			{/if}

			{#if left.length}
				<Section header={t('clips.left')} footer={t('clips.left.footer')}>
					{#each left as row (row.clip.row)}
						<Row title={row.clip.name} subtitle={subtitle(row)} chevron class="clip-row left" onclick={() => openPick(row)}>
							{#snippet leading()}<span class="icon warn" aria-hidden="true"><CircleAlert class="size-[20px]" strokeWidth={2} /></span>{/snippet}
						</Row>
					{/each}
				</Section>
			{/if}

			{#if rowIssues.length}
				<Section>
					{#each rowIssues as issue, i (i)}
						<Row title={issueText(issue)} class="problem quiet-problem" />
					{/each}
				</Section>
			{/if}
		</div>
	</Columns>

	{#snippet accessory()}
		<Toolbar label={t('clips.title')}>
			<Button variant="plain" href="/slates">{t('common.cancel')}</Button>
			<Button variant="filled" disabled={!preview.plan.counts.takes || saving} onclick={commit}>{commitText(preview.plan.counts.takes)}</Button>
		</Toolbar>
	{/snippet}
</Page>

<TakePicker bind:open={pickOpen} clip={picked?.clip} current={picked?.match.takeId} {lines} rows={preview.rows} onpick={pick} />

<style>
	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.column {
		padding-left: 16px;
		background: var(--group-bg, var(--cell));
	}
	.cell {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: var(--touch, 44px);
		padding-right: 16px;
	}
	.column:not(:last-child) .cell {
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.label {
		flex: none;
		width: 40%;
		max-width: 180px;
		font-size: 17px;
		color: var(--label);
	}
	select {
		flex: 1;
		min-width: 0;
		min-height: var(--touch, 44px);
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		color: var(--tint);
		font-size: 17px;
		text-align: right;
		text-align-last: right;
		outline: none;
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
	.icon.quiet {
		color: var(--label-2);
	}
	:global(.ios-row.clip-row .subtitle) {
		white-space: pre-line;
	}
	:global(.ios-row.problem .title) {
		white-space: normal;
		color: var(--warning);
	}
	:global(.ios-row.quiet-problem .title) {
		color: var(--label-2);
		font-size: 15px;
	}
</style>
