<script lang="ts">
	// A list row: leading (an icon tile), title and subtitle, detail on the right, a chevron or a
	// checkmark. A link with `href`, a button with `onclick`, plain otherwise. Highlights on press.
	// `swipe`: trailing actions revealed by swiping left (ios/swipe.ts decides where it settles);
	// a full swipe runs the first; Tab onto an action reveals them too.
	import type { Snippet } from 'svelte';
	import { Check, ChevronRight } from '@lucide/svelte';
	import { ACTION_W, swipeState } from '$lib/ios/swipe';

	type Action = { label: string; destructive?: boolean; run: () => void };
	let {
		title,
		subtitle,
		detail,
		href,
		onclick,
		chevron,
		checked,
		destructive = false,
		leading,
		trailing,
		swipe,
		class: cls = ''
	}: {
		title: string | Snippet;
		subtitle?: string;
		detail?: string;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		chevron?: boolean;
		checked?: boolean;
		destructive?: boolean;
		leading?: Snippet;
		trailing?: Snippet;
		swipe?: Action[];
		class?: string;
	} = $props();

	const showChevron = $derived(chevron ?? (!!href && checked === undefined));
	const actions = $derived(swipe ?? []);
	const width = $derived(actions.length * ACTION_W);

	// ---- swipe
	let row = $state<HTMLElement | null>(null);
	let offset = $state(0);
	let dragging = $state(false);
	let full = $state(false);
	let open = false;
	let start: { x: number; y: number; base: number; id: number } | null = null;
	let axis: 'x' | 'y' | null = null;
	let samples: { x: number; t: number }[] = [];
	let swallowClick = false;

	function down(e: PointerEvent) {
		if (!actions.length || e.button !== 0) return;
		start = { x: e.clientX, y: e.clientY, base: open ? -width : 0, id: e.pointerId };
		axis = null;
		samples = [{ x: e.clientX, t: e.timeStamp }];
	}
	function move(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		if (!axis) {
			if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
			axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
			if (axis === 'y') return void (start = null);
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			dragging = true;
		}
		samples = [...samples.filter((s) => e.timeStamp - s.t < 80), { x: e.clientX, t: e.timeStamp }];
		const s = swipeState(start.base + dx, row?.offsetWidth ?? 390, actions);
		offset = s.offset;
		full = s.full;
	}
	function up(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const wasDrag = dragging;
		const dx = e.clientX - start.x;
		const first = samples[0];
		const v = first && e.timeStamp > first.t ? (e.clientX - first.x) / (e.timeStamp - first.t) : 0;
		const s = swipeState(start.base + dx, row?.offsetWidth ?? 390, actions, v);
		start = null;
		dragging = false;
		full = false;
		if (!wasDrag) return;
		swallowClick = true;
		if (s.settle === 'full') {
			offset = -(row?.offsetWidth ?? 390);
			setTimeout(() => {
				actions[0].run();
				close();
			}, 200);
		} else if (s.settle === 'open') {
			open = true;
			offset = -width;
		} else close();
	}
	function cancel() {
		start = null;
		dragging = false;
		full = false;
		offset = open ? -width : 0;
	}
	function close() {
		open = false;
		offset = 0;
	}
	function contentClick(e: MouseEvent) {
		if (swallowClick) {
			swallowClick = false;
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (open) {
			e.preventDefault();
			close();
			return;
		}
		onclick?.(e);
	}
	function revealOnFocus() {
		open = true;
		offset = -width;
	}
	function actionsBlur(e: FocusEvent) {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) close();
	}
	const leftShift = $derived(-offset);
</script>

{#snippet body()}
	{#if leading}<span class="lead">{@render leading()}</span>{/if}
	<span class="inner" class:has-lead={!!leading}>
		<span class="text">
			<span class="title">{#if typeof title === 'string'}{title}{:else}{@render title()}{/if}</span>
			{#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
		</span>
		{#if detail}<span class="detail">{detail}</span>{/if}
		{@render trailing?.()}
		{#if checked}<Check class="check size-[20px]" strokeWidth={2.6} aria-hidden="true" />{:else if checked === false}<span class="check-space" aria-hidden="true"></span>{/if}
		{#if showChevron}<ChevronRight class="chev size-[18px]" strokeWidth={2.4} aria-hidden="true" />{/if}
	</span>
{/snippet}

<div class="ios-row {cls}" class:with-lead={!!leading} class:swipeable={actions.length > 0} role="listitem" bind:this={row}>
	{#if actions.length}
		<div class="actions" style:width="{Math.max(leftShift, 0)}px" onfocusin={revealOnFocus} onfocusout={actionsBlur}>
			{#each actions as a, i (a.label)}
				<button
					type="button"
					class="action"
					class:red={a.destructive}
					class:grow={full && i === 0}
					class:gone={full && i > 0}
					onclick={() => {
						a.run();
						close();
					}}>{a.label}</button
				>
			{/each}
		</div>
	{/if}
	<div
		class="content"
		class:dragging
		style:transform={offset ? `translateX(${offset}px)` : undefined}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={cancel}
		role="presentation"
	>
		{#if href}
			<a class="cell" class:red={destructive} {href} draggable="false" onclick={contentClick} aria-current={checked ? 'true' : undefined}>{@render body()}</a>
		{:else if onclick}
			<button type="button" class="cell" class:red={destructive} onclick={contentClick} aria-pressed={checked === undefined ? undefined : checked}>{@render body()}</button>
		{:else}
			<div class="cell static" class:red={destructive}>{@render body()}</div>
		{/if}
	</div>
</div>

<style>
	.ios-row {
		position: relative;
		overflow: hidden;
		background: var(--group-bg, var(--cell));
	}
	.content {
		position: relative;
		z-index: 1;
		background: inherit;
		transition: transform var(--dur-snap) var(--ease-ios);
		touch-action: pan-y;
	}
	.content.dragging {
		transition: none;
	}
	.cell {
		display: flex;
		align-items: center;
		width: 100%;
		min-height: 44px;
		padding-left: 16px;
		text-align: left;
		color: var(--label);
		background: transparent;
		transition: background-color var(--dur-press);
		-webkit-user-select: none;
		user-select: none;
	}
	a.cell:active,
	button.cell:active {
		background: var(--fill-3);
		transition: none;
	}
	.cell:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	.lead {
		flex: none;
		display: flex;
		align-items: center;
		margin-right: 15px;
	}
	.inner {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		align-self: stretch;
		min-height: 44px;
		padding: 11px 16px 11px 0;
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	/* A switch or a stepper overhangs the row's padding: the row stays 44 tall, its target 44. */
	.inner :global(.ios-toggle) {
		margin: -11px 0;
	}
	.inner :global(.ios-stepper) {
		margin: -5px 0;
	}
	.ios-row:last-child .inner {
		box-shadow: none;
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.title {
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.subtitle {
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.text:has(.subtitle) {
		min-height: 36px;
	}
	.detail {
		flex: none;
		max-width: 55%;
		font-size: 17px;
		letter-spacing: -0.43px;
		color: var(--label-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.red .title {
		color: var(--destructive);
	}
	.inner :global(.chev) {
		flex: none;
		color: var(--label-3);
		margin-right: -4px;
	}
	.inner :global(.check) {
		flex: none;
		color: var(--tint);
	}
	.check-space {
		width: 20px;
		flex: none;
	}
	.actions {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		display: flex;
		overflow: hidden;
		transition: width var(--dur-snap) var(--ease-ios);
	}
	.swipeable:has(.content.dragging) .actions {
		transition: none;
	}
	.action {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 8px;
		background: linear-gradient(var(--fill), var(--fill)), var(--cell);
		color: var(--label);
		font-size: 15px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		transition: flex-grow var(--dur-reveal);
	}
	.action.red {
		background: var(--destructive-solid);
		color: var(--on-destructive);
	}
	.action.grow {
		flex-grow: 10;
		justify-content: flex-start;
	}
	.action.gone {
		flex-grow: 0;
		padding: 0;
	}
	.action:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: -4px;
	}
	@media (prefers-reduced-motion: reduce) {
		.content,
		.actions {
			transition-duration: 150ms;
		}
	}
</style>
