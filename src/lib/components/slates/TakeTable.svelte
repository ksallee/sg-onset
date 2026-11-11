<script lang="ts">
	// Takes as a table: a line per take (one camera's take), grouped by take number, with the key
	// values, start and end time and marks. The selection column sits on the holding hand's edge:
	// tap a circle to toggle, drag down the circles to select (or clear, from a selected one) every
	// take passed, Range then a tap to fill from the last tapped. While anything is selected a tap
	// on a line toggles it too; otherwise it opens the take. The selection is data
	// (slates/selection.ts); this draws it and turns touches into it.
	import { Check } from '@lucide/svelte';
	import { formatTime } from '$lib/app/format';
	import { settings } from '$lib/app/settings.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import type { Take } from '$lib/model/types';
	import { fieldRef } from '$lib/slates/fields';
	import { dragSpan, extendTo, toggle, type Selection } from '$lib/slates/selection';
	import type { DayTakeLine, TakeLine } from '$lib/slates/takes';
	import { valueText } from './values';

	let {
		lines,
		showSlate = false,
		selection = $bindable(),
		range = $bindable(false),
		onopen,
		label
	}: {
		lines: (TakeLine | DayTakeLine)[];
		showSlate?: boolean;
		selection: Selection;
		range?: boolean;
		onopen?: (take: Take) => void;
		label: string;
	} = $props();

	const order = $derived(lines.map((l) => l.take.id));
	const selecting = $derived(selection.ids.size > 0);
	const left = $derived(settings.value.hand === 'left');
	const short = (key: string) => tk(`field.take.${key}.short`);
	const COLUMNS = ['tStop', 'focusDistance', 'lensHeight'] as const;
	const refs = Object.fromEntries(COLUMNS.map((k) => [k, fieldRef('take', k)!]));
	const cell = (take: Take, key: (typeof COLUMNS)[number]) => valueText(refs[key], take[key], settings.value.units);

	function tap(id: string) {
		if (range) {
			selection = extendTo(selection, order, id);
			range = false;
		} else selection = toggle(selection, id);
	}

	// A drag down the selection column. A press that does not leave its line is a tap.
	let drag: { base: Selection; from: string; moved: boolean; id: number; y: number; scroller: HTMLElement | null } | null = null;
	let raf = 0;
	const lineAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-take]') as HTMLElement | null)?.dataset.take;

	function down(e: PointerEvent, id: string) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { base: selection, from: id, moved: false, id: e.pointerId, y: e.clientY, scroller: (e.currentTarget as HTMLElement).closest('.ios-page-scroll') };
	}
	function follow(x: number, y: number) {
		if (!drag) return;
		const over = lineAt(x, y);
		if (!over) return;
		if (over !== drag.from) drag.moved = true;
		if (drag.moved) selection = dragSpan(drag.base, order, drag.from, over);
	}
	function move(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.id) return;
		drag.y = e.clientY;
		follow(e.clientX, e.clientY);
		// Near the top or foot of the scroll, it scrolls on, so a long run fits in one drag.
		cancelAnimationFrame(raf);
		const x = e.clientX;
		const edge = () => {
			if (!drag?.scroller) return;
			const box = drag.scroller.getBoundingClientRect();
			const step = drag.y > box.bottom - 56 ? 8 : drag.y < box.top + 96 ? -8 : 0;
			if (!step) return;
			drag.scroller.scrollTop += step;
			follow(x, drag.y);
			raf = requestAnimationFrame(edge);
		};
		raf = requestAnimationFrame(edge);
	}
	function up(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.id) return;
		cancelAnimationFrame(raf);
		const { moved, from } = drag;
		drag = null;
		if (!moved) tap(from);
	}
	function cancel() {
		cancelAnimationFrame(raf);
		drag = null;
	}
	function lineClick(take: Take) {
		if (selecting || range) tap(take.id);
		else onopen?.(take);
	}
</script>

{#snippet sel(take: Take, camera: string, on: boolean)}
	<td class="sel">
		<button
			type="button"
			role="checkbox"
			aria-checked={on}
			aria-label={t('slates.table.selectTake', { take: take.take ?? '', camera: camera })}
			onpointerdown={(e) => down(e, take.id)}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={cancel}
			onclick={(e) => {
				e.stopPropagation();
				if (e.detail === 0) tap(take.id);
			}}
		>
			<span class="dot" class:on>{#if on}<Check class="size-[15px]" strokeWidth={3.2} />{/if}</span>
		</button>
	</td>
{/snippet}

<div class="take-wrap"><div class="take-table">
	<table aria-label={label}>
		<thead>
			<tr>
				{#if left}<th class="sel" scope="col"><span class="sr-only">{t('slates.table.select')}</span></th>{/if}
				{#if showSlate}<th scope="col" class="slate">{tk('field.slate.slateUID')}</th>{/if}
				<th scope="col" class="take">{short('take')}</th>
				<th scope="col">{short('cameraSetupId')}</th>
				<th scope="col" class="num">{short('focalLength')}</th>
				{#each COLUMNS as key (key)}<th scope="col" class="num opt-{key}">{short(key)}</th>{/each}
				<th scope="col" class="num">{short('startedAt')}</th>
				<th scope="col" class="num opt-end">{short('endedAt')}</th>
				<th scope="col" class="marks">{t('slates.table.marks')}</th>
				{#if !left}<th class="sel" scope="col"><span class="sr-only">{t('slates.table.select')}</span></th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each lines as line (line.take.id)}
				{@const take = line.take}
				{@const on = selection.ids.has(take.id)}
				<tr data-take={take.id} class:first={line.first} class:on onclick={() => lineClick(take)}>
					{#if left}{@render sel(take, line.camera, on)}{/if}
					{#if showSlate}<td class="slate">{line.first && 'slate' in line ? line.slate.slateUID : ''}</td>{/if}
					<td class="take">
						{#if onopen && !selecting && !range}
							<button type="button" class="open" aria-label={t('slates.table.open', { take: `${take.take ?? ''} ${line.camera}`.trim() })} onclick={(e) => { e.stopPropagation(); onopen(take); }}>{line.first ? take.take : ''}</button>
						{:else}{line.first ? take.take : ''}{/if}
					</td>
					<td class="cam">{line.camera}</td>
					<td class="num">{line.focal}</td>
					{#each COLUMNS as key (key)}<td class="num opt-{key}">{cell(take, key)}</td>{/each}
					<td class="num">{formatTime(take.startedAt)}</td>
					<td class="num opt-end">{formatTime(take.endedAt)}</td>
					<td class="marks">
						{#if take.circleTake}<span class="mark circled" title={t('slates.table.circled')}>{tk('field.take.circleTake.short')}</span>{/if}
						{#if take.noGood}<span class="mark ng" title={t('slates.table.noGood')}>{tk('field.take.noGood.short')}</span>{/if}
					</td>
					{#if !left}{@render sel(take, line.camera, on)}{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div></div>

<style>
	.take-wrap {
		padding: 0 var(--page-margin, 16px);
	}
	.take-table {
		container: take-table / inline-size;
		border-radius: 10px;
		background: var(--cell);
		overflow: hidden;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
		line-height: 20px;
		font-variant-numeric: tabular-nums;
	}
	th {
		padding: 10px 8px 8px;
		font-size: 12px;
		line-height: 16px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--label-2);
		text-align: left;
		white-space: nowrap;
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	td {
		height: var(--touch, 44px);
		padding: 0 8px;
		color: var(--label);
		white-space: nowrap;
	}
	.num {
		text-align: right;
	}
	tbody tr {
		cursor: default;
		transition: background-color var(--dur-press);
	}
	tbody tr.first:not(:first-child) td {
		box-shadow: inset 0 var(--hairline) 0 var(--separator);
	}
	tbody tr.on td {
		background: color-mix(in srgb, var(--tint) 14%, transparent);
	}
	tbody tr:active td {
		background: var(--fill-3);
		transition: none;
	}
	.take,
	.slate {
		font-weight: 600;
		width: 1%;
	}
	.cam {
		color: var(--label-2);
	}
	.open {
		min-width: 44px;
		min-height: var(--touch, 44px);
		margin: 0 -8px;
		padding: 0 8px;
		text-align: left;
		font-weight: 600;
		color: var(--tint);
	}
	/* The selection column: on the holding hand's edge, wide enough for a thumb to run down. */
	.sel {
		width: 56px;
		padding: 0;
	}
	td.sel button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: var(--touch, 44px);
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
	}
	.dot {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1.5px var(--label-3);
		color: var(--on-tint);
		transition: transform var(--dur-control) var(--ease-ios), background-color var(--dur-control);
	}
	.dot.on {
		background: var(--tint);
		box-shadow: none;
		transform: scale(1.08);
	}
	.marks {
		width: 1%;
		text-align: right;
		padding-right: 12px;
	}
	.mark {
		display: inline-block;
		margin-left: 4px;
		padding: 1px 7px;
		border-radius: 6px;
		font-size: 12px;
		line-height: 18px;
		font-weight: 600;
	}
	.mark.circled {
		box-shadow: inset 0 0 0 1.5px var(--tint);
		border-radius: 9px;
		color: var(--tint);
	}
	.mark.ng {
		background: color-mix(in srgb, var(--destructive) 16%, transparent);
		color: var(--destructive);
	}
	@container take-table (max-width: 620px) {
		.opt-focusDistance,
		.opt-lensHeight,
		.opt-end {
			display: none;
		}
	}
	@container take-table (max-width: 440px) {
		.opt-tStop {
			display: none;
		}
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
