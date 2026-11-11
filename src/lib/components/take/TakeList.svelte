<script lang="ts">
	// The takes, by slate. `at` side: a column of rows. `at` top: one strip of chips that scrolls
	// sideways. The take on screen is marked; a rolling take shows a square and its time.
	import { ChevronLeft, Images, SlidersHorizontal } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';
	import { elapsedMs, formatClock, formatElapsed, phaseOf } from '$lib/take/record';
	import { groupBySlate } from '$lib/take/session';
	import type { Take } from '$lib/take/types';

	let {
		at,
		takes,
		currentId,
		now,
		onselect,
		onsettings,
		settingsOpen = false
	}: {
		at: 'side' | 'top';
		takes: readonly Take[];
		currentId: string;
		now: number;
		onselect: (id: string) => void;
		/** Given: a Setup button at the end of the strip (compact, where the rail has no room). */
		onsettings?: () => void;
		settingsOpen?: boolean;
	} = $props();

	const groups = $derived(groupBySlate(takes));
	const offset = -new Date().getTimezoneOffset();

	// The take on screen stays in view, without a scroll animation.
	let el = $state<HTMLElement | null>(null);
	$effect(() => {
		void currentId;
		void takes.length;
		el?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
</script>

{#snippet status(take: Take)}
	{@const phase = phaseOf(take)}
	{#if phase === 'rolling'}
		<span class="state rolling"><span class="sq" aria-hidden="true"></span>{t('phase.rolling')} <span class="num">{formatElapsed(elapsedMs(take, now))}</span></span>
	{:else if phase === 'filed'}
		<span class="state num">{formatClock(take.start ?? 0, offset)} · {formatElapsed(elapsedMs(take, now))}</span>
	{:else}
		<span class="state">{t('phase.idle')}</span>
	{/if}
{/snippet}

<nav class="take-list" data-at={at} aria-label={t('take.list')} bind:this={el}>
	<a class="back" href="/" aria-label={t('take.back')}><ChevronLeft class="size-6" strokeWidth={2.4} />{#if at === 'side'}<span>{t('take.back')}</span>{/if}</a>
	<div class="scroll">
		{#each groups as g (g.scene + g.slate)}
			<section>
				<h2><span class="slate">{t('take.slateHeader', { slate: g.slate })}</span>{#if at === 'side'}<span class="scene">{t('take.scene')} {g.scene}</span>{/if}</h2>
				<div class="rows">
					{#each g.takes as take (take.id)}
						<button type="button" class="row" class:on={take.id === currentId} aria-current={take.id === currentId} aria-label={t('take.row.full', { slate: take.slate, take: take.take })} onclick={() => onselect(take.id)}>
							<span class="n num">{take.take}</span>
							{#if at === 'side'}
								<span class="meta">
									<span class="name">{t('take.row', { take: take.take })}</span>
									{@render status(take)}
								</span>
								{#if take.stills.length}<span class="stills num"><Images class="size-4" strokeWidth={2} />{take.stills.length}</span>{/if}
							{:else if phaseOf(take) === 'rolling'}
								<span class="sq" aria-hidden="true"></span>
							{/if}
						</button>
					{/each}
				</div>
			</section>
		{/each}
	</div>
	{#if onsettings}
		<button type="button" class="gear" aria-label={t('rail.settings')} aria-pressed={settingsOpen} onclick={onsettings}><SlidersHorizontal class="size-6" strokeWidth={2} /></button>
	{/if}
</nav>

<style>
	.take-list {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}
	.back {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 52px;
		padding: 0 10px;
		font-size: 17px;
		color: var(--tint);
	}
	.back:active {
		opacity: 0.5;
	}
	h2 {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 16px 6px;
	}
	.slate {
		font-size: 17px;
		font-weight: 700;
		letter-spacing: -0.43px;
	}
	.scene {
		font-size: 13px;
		color: var(--label-2);
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 8px 14px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 60px;
		padding: 6px 12px 6px 8px;
		border-radius: 14px;
		color: var(--label);
		text-align: left;
	}
	.row:active {
		background: var(--press);
	}
	.row.on {
		background: var(--fill);
	}
	.n {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		height: 44px;
		padding: 0 6px;
		border-radius: 11px;
		background: var(--fill-3);
		font-family: var(--font-rounded);
		font-size: 22px;
		font-weight: 700;
	}
	.row.on .n {
		background: var(--label);
		color: var(--bg);
	}
	.meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.name {
		font-size: 16px;
		line-height: 21px;
		font-weight: 600;
		letter-spacing: -0.31px;
	}
	.state {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
	.state.rolling {
		color: var(--record);
		font-weight: 700;
	}
	.sq {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		background: var(--record);
	}
	.stills {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		font-weight: 600;
		color: var(--label-2);
	}

	/* The strip on top. */
	.take-list[data-at='top'] {
		flex-direction: row;
		align-items: center;
		min-height: 0;
		height: 64px;
		padding: 0 6px;
	}
	[data-at='top'] .back {
		flex: none;
		width: 44px;
		height: 44px;
		justify-content: center;
		padding: 0;
	}
	[data-at='top'] .scroll {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 14px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		padding: 0 6px;
	}
	[data-at='top'] section {
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	[data-at='top'] h2 {
		padding: 0;
	}
	[data-at='top'] .slate {
		font-size: 13px;
		font-weight: 600;
		color: var(--label-2);
		white-space: nowrap;
	}
	[data-at='top'] .rows {
		flex-direction: row;
		gap: 6px;
		padding: 0;
	}
	[data-at='top'] .row {
		position: relative;
		min-height: 0;
		padding: 0;
		border-radius: 12px;
	}
	[data-at='top'] .row.on {
		background: none;
		box-shadow: none;
	}
	[data-at='top'] .row .sq {
		position: absolute;
		top: -3px;
		right: -3px;
		box-shadow: 0 0 0 2px var(--bg);
	}
	.gear {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		color: var(--label);
	}
	.gear[aria-pressed='true'] {
		background: var(--label);
		color: var(--bg);
	}
</style>
