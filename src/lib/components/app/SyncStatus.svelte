<script lang="ts">
	// The sync status in the navigation: quiet, always there, a tap opens the detail. A shape and
	// words say the state, never the colour alone. `placement`: a row at the foot of the sidebar,
	// an icon over a word in the strip, a pill in the top bar (icon and count in a narrow one).
	import { CloudAlert, CloudCheck, CloudUpload, LogIn, Unlink, WifiOff, Wrench } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';
	import type { SyncState, SyncStatus } from '$lib/app/sync/status';

	let { summary, placement, onclick }: { summary: SyncStatus; placement: 'side' | 'strip' | 'top'; onclick: () => void } = $props();

	// Each state has its own shape, so none is told by colour alone.
	const ICONS: Record<SyncState, typeof CloudCheck> = {
		attention: CloudAlert,
		signedOut: LogIn,
		expired: LogIn,
		unlinked: Unlink,
		setup: Wrench,
		offline: WifiOff,
		syncing: CloudUpload,
		synced: CloudCheck
	};
	const Icon = $derived(ICONS[summary.state]);
	const text = $derived(t(summary.key, { n: summary.count }));
	const label = $derived(summary.count > 0 && summary.state !== 'attention' && summary.state !== 'syncing' ? t('sync.state.open', { status: text, n: summary.count }) : t('sync.open', { status: text }));
</script>

<button type="button" class="sync-status" data-placement={placement} data-state={summary.state} aria-label={label} {onclick}>
	<span class="glyph">
		<Icon class="size-[22px]" strokeWidth={1.8} />
		{#if summary.count > 0}<span class="count num">{summary.count > 999 ? '999+' : summary.count}</span>{/if}
	</span>
	<span class="full">{text}</span>
	<span class="short">{t(summary.shortKey)}</span>
</button>

<style>
	.sync-status {
		display: flex;
		align-items: center;
		color: var(--label-2);
		border-radius: 12px;
		-webkit-user-select: none;
		user-select: none;
	}
	.sync-status:active {
		background: var(--fill-3);
	}
	.sync-status:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: -2px;
	}
	/* Something waits for a person: full strength, and bold. */
	[data-state='attention'] {
		color: var(--label);
		font-weight: 600;
	}
	.glyph {
		position: relative;
		flex: none;
		display: flex;
	}
	.count,
	.short {
		display: none;
	}
	.count {
		position: absolute;
		top: -7px;
		left: 14px;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--label-2);
		color: var(--bg);
		font-size: 11px;
		line-height: 18px;
		font-weight: 700;
		text-align: center;
	}
	[data-state='attention'] .count {
		background: var(--label);
	}
	.full {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	[data-placement='side'] {
		gap: 14px;
		width: 100%;
		min-height: max(48px, var(--touch, 44px));
		padding: 0 12px;
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		text-align: left;
	}

	[data-placement='strip'] {
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		width: 100%;
		min-height: max(60px, var(--touch, 44px));
		font-size: 11px;
		line-height: 13px;
		font-weight: 500;
	}
	[data-placement='strip'] .full {
		display: none;
	}
	[data-placement='strip'] .short,
	[data-placement='strip'] .count {
		display: block;
	}

	[data-placement='top'] {
		gap: 8px;
		min-height: max(44px, var(--touch, 44px));
		padding: 0 12px;
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
	}
	/* A phone-width bar (NavShell's container): the icon and the count. */
	@container (max-width: 699px) {
		[data-placement='top'] {
			min-width: 52px;
			justify-content: center;
			padding: 0 6px;
		}
		[data-placement='top'] .full {
			display: none;
		}
		[data-placement='top'] .count {
			display: block;
		}
	}
</style>
