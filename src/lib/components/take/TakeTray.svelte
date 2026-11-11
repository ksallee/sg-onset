<script lang="ts">
	// The dock at rest, beside the rail: the take's timing (what Record made), then the thumb's
	// way into the numbers: the cameras as three letters and one row per number. A row opens the
	// keypad on that field, so one thumb does all of it. In a phone-width window: the timing on
	// one band; the tiles above are already under the thumb there.
	import { Lock } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';
	import type { Form } from '$lib/ios/handedness';
	import { FIELDS, fieldEditable, specFor } from '$lib/take/fields';
	import { formatClock, formatElapsed } from '$lib/take/record';
	import type { TakeScreen } from '$lib/take/screen.svelte';
	import { SETUP_IDS } from '$lib/take/types';

	let { screen, form }: { screen: TakeScreen; form: Form } = $props();
	const take = $derived(screen.take);
	const offset = -new Date().getTimezoneOffset();
	const clock = (ms: number | null) => (ms === null ? '–' : formatClock(ms, offset));
</script>

<div class="tray" data-form={form}>
	<section class="timing" class:rolling={screen.phase === 'rolling'} aria-label={t('timing.title')}>
		<h2>{t('timing.title')}</h2>
		<p class="length num">{screen.phase === 'idle' ? '–:––' : formatElapsed(screen.elapsed)}</p>
		<dl>
			<div><dt>{t('timing.start')}</dt><dd class="num">{clock(take.start)}</dd></div>
			<div><dt>{t('timing.end')}</dt><dd class="num">{clock(take.end)}</dd></div>
		</dl>
	</section>

	{#if form !== 'compact'}
		<section class="numbers" aria-label={t('tray.numbers')}>
			<div class="cams" role="group" aria-label={t('take.cameras')}>
				{#each SETUP_IDS as id (id)}
					<button type="button" class:on={id === screen.setup} aria-pressed={id === screen.setup} aria-label={t('tray.camera', { id })} onclick={() => screen.pickSetup(id)}>{id}</button>
				{/each}
			</div>
			<div class="rows">
				{#each FIELDS as f (f.key)}
					{@const spec = specFor(f.key, screen.lens)}
					{@const value = screen.shown(f.key)}
					{#snippet row()}
						<span class="label">{t(f.label)}</span>
						<span class="value num" class:first={spec.unitFirst}>
							<span class="n" class:empty={!value}>{value || '–'}</span><span class="unit">{t(spec.unit)}</span>
						</span>
					{/snippet}
					{#if fieldEditable(f.key, screen.lens)}
						<button type="button" class="row" aria-label={t('tray.edit', { field: t(f.label) })} onclick={() => screen.openField(f.key)}>{@render row()}</button>
					{:else}
						<div class="row locked"><Lock class="size-3.5" strokeWidth={2.4} aria-hidden="true" />{@render row()}</div>
					{/if}
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.tray {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px 12px;
		overflow-y: auto;
		overscroll-behavior-y: contain;
	}
	h2,
	dt {
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	.timing {
		flex: none;
		padding: 12px 14px;
		border-radius: 18px;
		background: var(--cell);
	}
	.timing.rolling {
		box-shadow: inset 0 0 0 2.5px var(--record);
	}
	.length {
		font-family: var(--font-rounded);
		font-size: 48px;
		line-height: 54px;
		font-weight: 700;
		letter-spacing: -1px;
	}
	.rolling .length {
		color: var(--record);
	}
	dl {
		display: flex;
		gap: 20px;
		margin-top: 2px;
	}
	dt {
		font-size: 12px;
		line-height: 16px;
	}
	dd {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
	}

	/* The numbers sit mid-height, where the thumb rests and where the keypad will be. */
	.numbers {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
		/* Its middle at 45 % of the dock's height: 190 px is half the block, 150 px the timing above. */
		margin-top: max(0px, calc(45cqh - 190px - 150px));
	}
	.cams {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
		padding: 4px;
		border-radius: 16px;
		background: var(--fill-3);
	}
	.cams button {
		height: 48px;
		border-radius: 12px;
		color: var(--label);
		font-family: var(--font-rounded);
		font-size: 22px;
		font-weight: 700;
	}
	.cams button.on {
		background: var(--label);
		color: var(--bg);
	}
	.cams button:active:not(.on) {
		background: var(--press);
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 58px;
		padding: 0 14px;
		border-radius: 14px;
		background: var(--cell);
		color: var(--label);
		text-align: left;
	}
	.row.locked {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--separator);
		color: var(--label-2);
	}
	button.row:active {
		background: var(--label);
		color: var(--bg);
	}
	.label {
		flex: 1;
		min-width: 0;
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.31px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.value {
		display: flex;
		align-items: baseline;
		gap: 4px;
		font-family: var(--font-rounded);
	}
	.value.first {
		flex-direction: row-reverse;
	}
	.n {
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.3px;
	}
	.n.empty {
		opacity: 0.4;
	}
	.unit {
		font-size: 16px;
		font-weight: 600;
		opacity: 0.6;
	}
	button:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: 2px;
	}

	/* A phone-width window: one band. */
	.tray[data-form='compact'] {
		flex: none;
		padding: 8px 16px;
		overflow: hidden;
	}
	[data-form='compact'] .timing {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 48px;
		padding: 0 14px;
		border-radius: 14px;
	}
	[data-form='compact'] h2 {
		display: none;
	}
	[data-form='compact'] .length {
		font-size: 28px;
		line-height: 34px;
		letter-spacing: -0.5px;
	}
	[data-form='compact'] dl {
		flex: 1;
		justify-content: flex-end;
		margin: 0;
	}
	[data-form='compact'] dl div {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	[data-form='compact'] dd {
		font-size: 15px;
	}
</style>
