<script lang="ts">
	// The takes of the slate being shot, one row per take number. `at` side: a column of rows with
	// the slate on top. `at` top: one strip that scrolls sideways. The take on screen is marked; a
	// running take shows a square and its time. The slate opens the slate picker.
	import { Ban, ChevronDown, CircleCheck, Images } from '@lucide/svelte';
	import { formatTime } from '$lib/app/format';
	import { t } from '$lib/i18n/messages';
	import { groupPhase, groupTimes } from '$lib/take/phase';
	import { groupMark } from '$lib/take/marks';
	import { elapsedMs, formatElapsed } from '$lib/take/record';
	import type { Shoot, TakeGroup } from '$lib/take/shoot.svelte';

	let { shoot, at, onslate }: { shoot: Shoot; at: 'side' | 'top'; onslate: () => void } = $props();

	const slate = $derived(shoot.slate);
	const about = $derived([slate?.sceneNumber ? `${t('take.scene')} ${slate.sceneNumber}` : '', slate?.description].filter(Boolean).join(' · '));
	const photos = (g: TakeGroup) => {
		const ids = new Set(g.takes.map((x) => x.id));
		return shoot.stills.value.filter((s) => ids.has(s.takeId)).length;
	};
	const shown = $derived(shoot.group?.number);

	// The take on screen stays in view, moved only when out of it, without a scroll animation.
	let el = $state<HTMLElement | null>(null);
	$effect(() => {
		void shown;
		void shoot.groups.length;
		const row = el?.querySelector<HTMLElement>('[aria-current="true"]');
		const box = el?.closest<HTMLElement>('.list');
		if (!row || !box) return;
		const r = row.getBoundingClientRect();
		const b = (at === 'top' ? row.closest<HTMLElement>('.scroll') : box)?.getBoundingClientRect();
		if (!b) return;
		if (r.top < b.top || r.bottom > b.bottom || r.left < b.left || r.right > b.right) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
</script>

{#snippet status(g: TakeGroup)}
	{@const phase = groupPhase(g)}
	{@const times = groupTimes(g)}
	{#if phase === 'rolling'}
		<span class="state rolling"><span class="sq" aria-hidden="true"></span>{t('phase.rolling')} <span class="num">{formatElapsed(elapsedMs(times, shoot.now))}</span></span>
	{:else if phase === 'filed'}
		<span class="state num">{formatTime(new Date(times.start ?? 0).toISOString())} · {formatElapsed(elapsedMs(times, 0))}</span>
	{:else}
		<span class="state">{t('phase.idle')}</span>
	{/if}
{/snippet}

<nav class="take-list" data-at={at} aria-label={t('take.list')} bind:this={el}>
	<button type="button" class="slate" aria-label="{t('take.slate.change')}: {t('take.slate')} {slate?.slateUID ?? ''}" onclick={onslate}>
		<span class="uid num">{slate?.slateUID ?? ''}</span>
		{#if at === 'side'}
			<span class="about">{about || t('take.slate.change')}</span>
		{/if}
		<ChevronDown class="size-5 chev" strokeWidth={2.4} />
	</button>
	<div class="scroll">
		{#each shoot.groups as g (g.number)}
			{@const on = g.number === shown}
			{@const n = photos(g)}
			<button type="button" class="row" class:on aria-current={on} aria-label={t('take.row.full', { slate: slate?.slateUID ?? '', take: g.number })} onclick={() => shoot.select(g.number)}>
				<span class="n num">{g.number}</span>
				{#if at === 'side'}
					<span class="meta">
						<span class="name">{t('take.row', { take: g.number })}</span>
						{@render status(g)}
					</span>
					<span class="icons">
						{#if groupMark(g, 'circleTake')}<CircleCheck class="size-5" strokeWidth={2.4} aria-label={t('marks.circle')} />{/if}
						{#if groupMark(g, 'noGood')}<Ban class="size-5" strokeWidth={2.4} aria-label={t('marks.noGood')} />{/if}
						{#if n}<span class="photos num"><Images class="size-4" strokeWidth={2} />{n}</span>{/if}
					</span>
				{:else if groupPhase(g) === 'rolling'}
					<span class="sq" aria-hidden="true"></span>
				{:else if groupMark(g, 'circleTake')}
					<span class="ring" aria-hidden="true"></span>
				{/if}
			</button>
		{:else}
			<p class="empty">{t('take.none')}</p>
		{/each}
	</div>
</nav>

<style>
	.take-list {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}
	.slate {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 6px;
		margin: 8px 8px 4px;
		padding: 8px 10px 8px 12px;
		border-radius: 14px;
		color: var(--label);
		text-align: left;
	}
	.slate:active {
		background: var(--press);
	}
	.uid {
		grid-column: 1;
		font-family: var(--font-rounded);
		font-size: 28px;
		line-height: 32px;
		font-weight: 700;
		letter-spacing: -0.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.about {
		grid-column: 1;
		grid-row: 2;
		font-size: 13px;
		line-height: 17px;
		color: var(--label-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.slate :global(.chev) {
		grid-column: 2;
		grid-row: 1;
		color: var(--tint);
	}
	.scroll {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 4px 8px 14px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 60px;
		padding: 6px 10px 6px 8px;
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
		background: var(--tint-solid);
		color: var(--on-tint-solid);
		box-shadow: inset 0 0 0 var(--state-ring) var(--on-tint-solid);
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
		white-space: nowrap;
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
	.icons {
		flex: none;
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--label-2);
	}
	.photos {
		display: flex;
		align-items: center;
		gap: 3px;
		font-size: 13px;
		font-weight: 600;
	}
	.empty {
		padding: 8px 10px;
		font-size: 15px;
		line-height: 20px;
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
	[data-at='top'] .slate {
		flex: none;
		display: flex;
		margin: 0;
		height: 48px;
		max-width: 40%;
		padding: 0 8px 0 10px;
	}
	[data-at='top'] .uid {
		font-size: 22px;
	}
	[data-at='top'] .scroll {
		flex: 1;
		min-width: 0;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		padding: 0 6px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}
	[data-at='top'] .scroll::-webkit-scrollbar {
		display: none;
	}
	[data-at='top'] .row {
		position: relative;
		flex: none;
		min-height: 0;
		padding: 0;
		border-radius: 12px;
	}
	[data-at='top'] .row.on {
		background: none;
	}
	[data-at='top'] .row .sq,
	[data-at='top'] .row .ring {
		position: absolute;
		top: -3px;
		right: -3px;
		box-shadow: 0 0 0 2px var(--bg);
	}
	.ring {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--label);
	}
	[data-at='top'] .empty {
		white-space: nowrap;
	}
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
</style>
