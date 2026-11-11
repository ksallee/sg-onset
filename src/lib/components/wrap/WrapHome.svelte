<script lang="ts">
	// The Wrap page: the day at a glance and what is left to fix on one side, the export and the
	// hand-over on the other. One column on a phone. The state is lib/wrap/wrap.svelte.ts.
	import { CalendarDays, Clapperboard, Printer } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import Columns from '$lib/components/ios/Columns.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { dayName } from '$lib/app/context';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatBytes, formatDate } from '$lib/app/format';
	import { useShell } from '$lib/app/shell.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import type { ShootDay } from '$lib/model/types';
	import { FILE_KINDS, type FileKind, type TextKind } from '$lib/wrap/choice';
	import { plural } from '$lib/wrap/make';
	import { previewTable, type Preview } from '$lib/wrap/preview';
	import type { TodoItem } from '$lib/wrap/summary';
	import { Wrap } from '$lib/wrap/wrap.svelte';
	import DaySummary from './DaySummary.svelte';
	import Deliver from './Deliver.svelte';
	import FileRow from './FileRow.svelte';
	import PreviewSheet from './PreviewSheet.svelte';
	import TodoList from './TodoList.svelte';

	const current = useCurrent();
	const shell = useShell();
	const wrap = new Wrap(useApp(), current);

	// "Exported today": the clock moves each minute while the page is open.
	$effect(() => {
		const timer = setInterval(() => (wrap.now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	const exported = $derived(wrap.exported ? t(wrap.exported.key, wrap.exported.params) : t('wrap.exported.never'));
	const dayLabel = (d: ShootDay) => {
		const n = dayName(d);
		return t(n.key, n.params);
	};
	/** Newest first, as the day picker shows them. */
	const daysNewest = $derived([...wrap.shootDays].sort((a, b) => (b.shootDate ?? '').localeCompare(a.shootDate ?? '') || (b.shootDay ?? 0) - (a.shootDay ?? 0)));
	const takeCount = $derived(wrap.made?.rows.length ?? 0);

	const spans = [
		{ value: 'day', label: t('wrap.span.day') },
		{ value: 'days', label: t('wrap.span.days') },
		{ value: 'project', label: t('wrap.span.project') }
	];
	const lengths = [
		{ value: 'imperial', label: t('wrap.units.imperial') },
		{ value: 'metric', label: t('wrap.units.metric') }
	];
	const plainUnits = [
		{ value: 'inline', label: t('wrap.units.inline') },
		{ value: 'columns', label: t('wrap.units.columns') }
	];

	function notes(kind: FileKind): { text: string; quiet?: boolean }[] {
		const made = wrap.made;
		const plan = wrap.plan;
		if (kind === 'photos') {
			if (!plan) return [];
			const pruned = plan.pruned.reduce((n, p) => n + p.count, 0);
			const out = [];
			if (pruned) out.push({ text: tk(plural('wrap.note.photos.pruned', pruned), { n: pruned }) });
			if (plan.missing.length) out.push({ text: tk(plural('wrap.note.photos.missing', plan.missing.length), { n: plan.missing.length }) });
			return out;
		}
		if (kind === 'report') return wrap.days.length > 1 ? [{ text: t('wrap.note.report.days', { n: wrap.days.length }), quiet: true }] : [];
		return made ? made.notes[kind].map((n) => ({ text: tk(n.key, n.params), quiet: n.key.endsWith('.never') })) : [];
	}
	function detail(kind: FileKind): string | undefined {
		const plan = wrap.plan;
		if (!plan || !wrap.choice.files.includes(kind)) return undefined;
		if (kind === 'photos') {
			const n = plan.entries.filter((e) => e.kind === 'photo').length;
			return n ? tk(plural('wrap.note.photos.count', n), { n, size: formatBytes(plan.photoBytes) }) : tk(plural('wrap.note.photos.count', 0), { n: 0, size: formatBytes(0) });
		}
		const entry = plan.entries.find((e) => e.kind === kind);
		return entry ? formatBytes(entry.size) : undefined;
	}

	// ---- preview
	let previewOpen = $state(false);
	let previewKind = $state<Exclude<TextKind, 'json'>>('crif');
	const preview = $derived.by<Preview | null>(() => {
		const text = wrap.made?.texts[previewKind];
		return text === undefined ? null : previewTable(previewKind, text, 8);
	});
	function openPreview(kind: Exclude<TextKind, 'json'>) {
		previewKind = kind;
		previewOpen = true;
	}

	const reportHref = $derived.by(() => {
		const q = new URLSearchParams({ days: wrap.days.map((d) => d.id).join(',') });
		if (wrap.choice.circledOnly) q.set('circled', '1');
		if (wrap.choice.excludeNoGood) q.set('ng', '0');
		return `/wrap/report?${q}`;
	});

	/** The report of the current day, every take. */
	const dayReportHref = $derived(current.shootDay ? `/wrap/report?days=${encodeURIComponent(current.shootDay.id)}` : '/wrap/report');

	function actions(kind: FileKind) {
		const on = wrap.choice.files.includes(kind);
		if (kind === 'photos') return [];
		const list: { label: string; run: () => void; disabled?: boolean }[] = [];
		if (kind === 'report') list.push({ label: t('wrap.file.print'), run: () => void goto(reportHref), disabled: !wrap.days.length });
		else if (kind !== 'json') list.push({ label: t('wrap.file.preview'), run: () => openPreview(kind), disabled: !on });
		list.push({ label: t('wrap.file.share'), run: () => void wrap.shareFile(kind, 'share'), disabled: !on || !wrap.days.length });
		list.push({ label: t('wrap.file.download'), run: () => void wrap.shareFile(kind, 'download'), disabled: !on || !wrap.days.length });
		return list;
	}

	/** Opens the take on Shoot: its day and slate picked, the take in the address. */
	function openTake(item: TodoItem) {
		current.select({ shootDayId: current.shootDay?.id, slateId: item.slateId });
		void goto(`/shoot?take=${encodeURIComponent(item.takeId)}`);
	}

	const titleOf = (k: FileKind) => t(`wrap.file.${k}`);
	const aboutOf = (k: FileKind) => t(`wrap.file.${k}.for`);
</script>

<svelte:head><title>{t('wrap.title')} · {t('app.name')}</title></svelte:head>

<Page width="columns">
	<NavBar title={t('wrap.title')} large />
	<ContextBar />
	{#if !current.shootDay}
		<EmptyState icon={CalendarDays} title={t('wrap.summary.noDay')} message={t('wrap.summary.noDay.message')}>
			{#snippet action()}<Button variant="filled" onclick={() => shell.openContext()}>{t('wrap.summary.pickDay')}</Button>{/snippet}
		</EmptyState>
	{:else if wrap.ready}
		<Columns>
			<div>
				{#if wrap.summary && wrap.summary.takes > 0}
					<DaySummary summary={wrap.summary} {exported} />
					<TodoList todo={wrap.summary.todo} onopen={openTake} />
				{:else}
					<Section header={t('wrap.summary.header')} footer={exported}>
						<div class="empty" role="listitem">
							<EmptyState icon={Clapperboard} title={t('wrap.summary.noTakes')} message={t('wrap.summary.noTakes.message')} />
						</div>
					</Section>
				{/if}
				{#if wrap.summary && wrap.summary.takes > 0}
					<Section>
						<Row title={t('wrap.report.open')} subtitle={t('wrap.report.open.sub')} href={dayReportHref}>
							{#snippet leading()}<Tile icon={Printer} color="var(--tint)" />{/snippet}
						</Row>
					</Section>
				{/if}
				{#if wrap.plan?.pruned.length && wrap.choice.files.includes('photos')}
					<Section header={t('wrap.pruned.header')} footer={t('wrap.pruned.footer')}>
						{#each wrap.plan.pruned as p (p.takeId)}
							<Row
								title={p.cameraLetter ? t('wrap.todo.takeCam', { slate: p.slate, take: p.take, camera: p.cameraLetter }) : t('wrap.todo.take', { slate: p.slate, take: p.take })}
								detail={tk(plural('wrap.pruned.row', p.count), { n: p.count })}
							/>
						{/each}
					</Section>
				{/if}
			</div>
			<div>
				<Section header={t('wrap.what.header')} footer={tk(plural('wrap.what.footer', takeCount), { n: takeCount })}>
					<div class="seg" role="listitem">
						<Segmented options={spans} value={wrap.choice.span} onchange={(v) => wrap.setSpan(v as 'day' | 'days' | 'project')} label={t('wrap.span')} />
					</div>
					{#if wrap.choice.span === 'days'}
						{#each daysNewest as d (d.id)}
							<Row title={dayLabel(d)} subtitle={[formatDate(d.shootDate), d.location].filter(Boolean).join(' · ')} checked={wrap.choice.dayIds.includes(d.id)} onclick={() => wrap.toggleDay(d.id)} />
						{/each}
					{/if}
					<Row title={t('wrap.circledOnly')}>
						{#snippet trailing()}<Toggle checked={wrap.choice.circledOnly} onchange={(v) => wrap.set({ circledOnly: v })} label={t('wrap.circledOnly')} />{/snippet}
					</Row>
					<Row title={t('wrap.excludeNoGood')}>
						{#snippet trailing()}<Toggle checked={wrap.choice.excludeNoGood} onchange={(v) => wrap.set({ excludeNoGood: v })} label={t('wrap.excludeNoGood')} />{/snippet}
					</Row>
				</Section>

				<Section header={t('wrap.files.header')} footer={t('wrap.files.footer')}>
					{#each FILE_KINDS as kind (kind)}
						<FileRow
							title={titleOf(kind)}
							about={aboutOf(kind)}
							notes={notes(kind)}
							detail={detail(kind)}
							on={wrap.choice.files.includes(kind)}
							ontoggle={() => wrap.toggleFile(kind)}
							actions={actions(kind)}
						/>
					{/each}
				</Section>

				<Section header={t('wrap.units.header')} footer={t('wrap.units.footer')}>
					<div class="unit" role="listitem">
						<span>{t('wrap.units.lengths')}</span>
						<Segmented small options={lengths} value={wrap.choice.lengths} onchange={(v) => wrap.set({ lengths: v as 'imperial' | 'metric' })} label={t('wrap.units.lengths')} />
					</div>
					<div class="unit" role="listitem">
						<span>{t('wrap.units.plain')}</span>
						<Segmented small options={plainUnits} value={wrap.choice.plainUnits} onchange={(v) => wrap.set({ plainUnits: v as 'inline' | 'columns' })} label={t('wrap.units.plain')} />
					</div>
				</Section>

				<Deliver {wrap} />
			</div>
		</Columns>
	{/if}
</Page>

<PreviewSheet bind:open={previewOpen} title={titleOf(previewKind)} {preview} />

<style>
	.seg {
		padding: 10px 16px;
	}
	.unit {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 16px;
		padding: 8px 16px;
		min-height: var(--touch, 44px);
		font-size: 17px;
		color: var(--label);
	}
	.unit + .unit {
		box-shadow: inset 0 var(--hairline) 0 var(--separator);
	}
	.unit :global(.ios-seg) {
		min-width: 240px;
	}
	.empty {
		padding: 8px 0;
	}
</style>
