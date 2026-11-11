<script lang="ts">
	// A camera setup in the list: its letter, the camera and the lens it holds. The row opens the
	// setup; the lens button beside it opens the lens picker at once, so a swap is two taps. With
	// `handle`, a grip at the leading edge moves the setup: drag it, or focus it and press the up
	// and down arrow keys. The list does the moving; the row only shows where it is (`offset`).
	import { ChevronRight, Menu as Grip } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';

	let {
		id,
		label,
		line,
		lensName,
		lens,
		selected = false,
		chevron = false,
		handle,
		offset = 0,
		dragging = false,
		onopen,
		onlens
	}: {
		id: string;
		label: string;
		/** The camera it holds. */
		line: string;
		/** The lens it holds, in full. */
		lensName: string;
		/** The lens's short name on the button: its focal length, or its model. */
		lens: string;
		selected?: boolean;
		chevron?: boolean;
		handle?: { onpointerdown: (e: PointerEvent) => void; onkeydown: (e: KeyboardEvent) => void };
		/** How far the row is shifted while a setup is dragged, in px. */
		offset?: number;
		dragging?: boolean;
		onopen: () => void;
		onlens: () => void;
	} = $props();

	const short = $derived(label.trim().length <= 2);
	const hintId = $props.id();
</script>

<div
	class="setup-row"
	class:selected
	class:dragging
	class:handled={!!handle}
	class:shifted={offset !== 0 && !dragging}
	style:transform={offset ? `translateY(${offset}px)` : undefined}
	role="listitem"
	data-setup-row={id}
>
	{#if handle}
		<button
			type="button"
			class="grip"
			aria-label={t('gear.order.handle', { setup: label })}
			aria-describedby={hintId}
			aria-keyshortcuts="ArrowUp ArrowDown"
			data-setup-handle={id}
			onpointerdown={handle.onpointerdown}
			onkeydown={handle.onkeydown}
		>
			<Grip class="size-[20px]" strokeWidth={2.2} aria-hidden="true" />
		</button>
		<span id={hintId} hidden>{t('gear.order.handle.hint')}</span>
	{/if}
	<div class="inner">
		<button type="button" class="open" onclick={onopen} aria-current={selected ? 'true' : undefined}>
			<span class="badge" class:long={!short} aria-hidden="true">{short ? label : label.slice(0, 1)}</span>
			<span class="text">
				<span class="title">{label}</span>
				<span class="subtitle">{line}</span>
				<span class="subtitle">{lensName}</span>
			</span>
		</button>
		<button type="button" class="lens" onclick={onlens} aria-label={t('gear.setup.swap', { setup: label })}>
			<span>{lens || t('gear.setup.lens')}</span>
		</button>
		{#if chevron}<ChevronRight class="chev size-[18px]" strokeWidth={2.4} aria-hidden="true" />{/if}
	</div>
</div>

<style>
	.setup-row {
		position: relative;
		display: flex;
		align-items: stretch;
		background: var(--group-bg, var(--cell));
		transition: background-color var(--dur-press);
	}
	.setup-row.shifted {
		transition:
			transform var(--dur-control) var(--ease-ios),
			background-color var(--dur-press);
	}
	.setup-row.dragging {
		z-index: 2;
		background: var(--cell-elevated);
		box-shadow:
			var(--shadow-2),
			inset 0 0 0 var(--state-ring) var(--tint);
		transition: none;
	}
	.setup-row.selected {
		background: var(--selection);
		box-shadow: inset 0 0 0 var(--state-ring) var(--tint);
	}
	.inner {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 76px;
		padding-right: 12px;
	}
	/* The hairline starts where the text does, after the badge, as the kit's Row after its icon. */
	.setup-row::after {
		content: '';
		position: absolute;
		left: 66px;
		right: 0;
		bottom: 0;
		height: 1px;
		/* As the kit draws it: an inset shadow paints a hairline thinner than a pixel. */
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		pointer-events: none;
	}
	.setup-row.handled::after {
		left: 94px;
	}
	.setup-row:last-child::after,
	.setup-row.dragging::after {
		display: none;
	}
	.grip {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--touch, 44px);
		margin-right: -8px;
		color: var(--label-3);
		touch-action: none;
		cursor: grab;
		-webkit-user-select: none;
		user-select: none;
	}
	.grip:active,
	.dragging .grip {
		color: var(--tint);
		cursor: grabbing;
	}
	.open {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 14px;
		align-self: stretch;
		padding: 8px 0 8px 16px;
		text-align: left;
		color: var(--label);
		transition: background-color var(--dur-press);
	}
	.handled .open {
		padding-left: 8px;
	}
	.open:active {
		background: var(--fill-3);
		transition: none;
	}
	.open:focus-visible,
	.lens:focus-visible,
	.grip:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	.badge {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 9px;
		background: var(--tint-solid);
		color: var(--on-tint-solid);
		box-shadow: inset 0 0 0 var(--status-ring) var(--tint);
		font-family: var(--font-rounded);
		font-size: 19px;
		font-weight: 700;
		letter-spacing: -0.3px;
	}
	.badge.long {
		background: var(--fill);
		color: var(--label);
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
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* A long camera or lens name wraps to a second line before it is cut. */
	.subtitle {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-size: 15px;
		line-height: 19px;
		letter-spacing: -0.23px;
		color: var(--label-2);
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.lens {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 64px;
		max-width: 140px;
		min-height: var(--touch, 44px);
		padding: 0 4px;
	}
	.lens span {
		display: block;
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--tint-fill);
		box-shadow: inset 0 0 0 var(--status-ring) var(--tint);
		color: var(--tint);
		font-size: 15px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: transform var(--dur-press) var(--ease-ios);
	}
	.lens:active span {
		transform: scale(0.94);
		transition: none;
	}
	.setup-row :global(.chev) {
		flex: none;
		color: var(--label-3);
	}
</style>
