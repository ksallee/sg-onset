<script lang="ts">
	// A camera setup in the list: its letter, the camera and the lens it holds. The row opens the
	// setup; the lens button beside it opens the lens picker at once, so a swap is two taps.
	import { ChevronRight } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';

	let {
		label,
		line,
		lensName,
		lens,
		selected = false,
		chevron = false,
		onopen,
		onlens
	}: {
		label: string;
		/** The camera it holds. */
		line: string;
		/** The lens it holds, in full. */
		lensName: string;
		/** The lens's short name on the button: its focal length, or its model. */
		lens: string;
		selected?: boolean;
		chevron?: boolean;
		onopen: () => void;
		onlens: () => void;
	} = $props();

	const short = $derived(label.trim().length <= 2);
</script>

<div class="setup-row" class:selected role="listitem">
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

<style>
	.setup-row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 76px;
		padding-right: 12px;
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		transition: background-color var(--dur-press);
	}
	.setup-row:last-child {
		box-shadow: none;
	}
	.setup-row.selected {
		background: var(--selection);
		box-shadow: inset 0 0 0 var(--state-ring) var(--tint);
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
	}
	.open:active {
		opacity: 0.6;
	}
	.open:focus-visible,
	.lens:focus-visible {
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
		font-family: var(--font-rounded);
		font-size: 19px;
		font-weight: 700;
		letter-spacing: -0.3px;
	}
	.badge.long {
		background: var(--fill);
		color: var(--label);
	}
	.text {
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
	.subtitle {
		font-size: 15px;
		line-height: 19px;
		letter-spacing: -0.23px;
		color: var(--label-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
