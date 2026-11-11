<script lang="ts">
	// Number entry, in the dock beside the rail, under the same thumb: the field and what is typed,
	// recent values as chips (one tap sets), a stepper (hold to repeat), our keypad, then Next and
	// Done. Next is on the rail's side. The rows keep their height from field to field, so the keys
	// never move. Nothing animates: it is the capture path.
	import { Minus, Plus } from '@lucide/svelte';
	import Chip from '$lib/components/ios/Chip.svelte';
	import Keypad from '$lib/components/ios/Keypad.svelte';
	import { t } from '$lib/i18n/messages';
	import type { Form, Hand } from '$lib/ios/handedness';
	import { entryValue } from '$lib/ios/keypad';
	import { formatField, nextField } from '$lib/take/fields';
	import type { TakeScreen } from '$lib/take/screen.svelte';

	let { screen, form, hand, gloves }: { screen: TakeScreen; form: Form; hand: Hand; gloves: boolean } = $props();

	const spec = $derived(screen.spec);
	const recents = $derived(spec ? screen.session.recents[spec.key].filter((v) => v >= spec.min && v <= spec.max) : []);
	const typed = $derived(spec ? entryValue(screen.entry, spec) : null);
	const last = $derived(!screen.field || nextField(screen.field, screen.lens) === null);

	// The stepper: one step on the press, then it repeats while held.
	let hold: ReturnType<typeof setTimeout> | undefined;
	let repeat: ReturnType<typeof setInterval> | undefined;
	function stepDown(e: PointerEvent, dir: 1 | -1) {
		if (e.button !== 0) return;
		stop();
		screen.step(dir);
		hold = setTimeout(() => (repeat = setInterval(() => screen.step(dir), 90)), 400);
	}
	function stop() {
		clearTimeout(hold);
		clearInterval(repeat);
	}
	$effect(() => stop);
</script>

{#if spec}
	<section class="number-dock" data-form={form} data-hand={hand} class:gloves aria-label={t(spec.label)}>
		<header>
			<h2>{t(spec.label)}</h2>
			<p class="value num" class:first={spec.unitFirst}>
				<span class="n" class:empty={!screen.entry.text}>{screen.entry.text || '–'}</span>
				<span class="unit">{t(spec.unit)}</span>
			</p>
			<p class="range num">{t('keypad.range', { min: formatField(spec.min, spec), max: formatField(spec.max, spec) })}</p>
		</header>

		<div class="chips" role="group" aria-label={t('keypad.recent')}>
			{#each recents as v (v)}
				<Chip on={v === typed} onclick={() => screen.pickRecent(v)}>{formatField(v, spec)}</Chip>
			{/each}
		</div>

		<div class="stepper">
			<button type="button" aria-label={t('keypad.less')} onpointerdown={(e) => stepDown(e, -1)} onpointerup={stop} onpointercancel={stop} onpointerleave={stop} onkeydown={(e) => e.key === 'Enter' && screen.step(-1)}><Minus class="size-7" strokeWidth={2.4} /></button>
			{#if spec.min < 0}
				<button type="button" class="sign" aria-label={t('keypad.sign')} onclick={() => screen.press('sign')}>±</button>
			{/if}
			<button type="button" aria-label={t('keypad.more')} onpointerdown={(e) => stepDown(e, 1)} onpointerup={stop} onpointercancel={stop} onpointerleave={stop} onkeydown={(e) => e.key === 'Enter' && screen.step(1)}><Plus class="size-7" strokeWidth={2.4} /></button>
		</div>

		<Keypad onkey={(k) => screen.press(k)} point={spec.decimals > 0} labels={{ keypad: t('keypad.label'), point: t('keypad.point'), back: t('keypad.back') }} />

		<div class="foot">
			<button type="button" class="done" onclick={() => screen.closeField()}>{t('keypad.done')}</button>
			<button type="button" class="next" disabled={last} onclick={() => screen.nextField()}>{t('keypad.next')}</button>
		</div>
	</section>
{/if}

<style>
	.number-dock {
		--key-h: 60px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		/* The middle of the keys at 45 % of the dock's height, where the thumb rests: the keys'
		   middle is about 345 px down the block. Top of the dock when it is short. */
		margin-top: max(0px, calc(45cqh - 345px));
		padding: 12px;
	}
	.number-dock.gloves {
		--key-h: 72px;
		margin-top: max(0px, calc(45cqh - 370px));
	}
	header {
		padding: 10px 14px 8px;
		border-radius: 18px;
		background: color-mix(in srgb, var(--tint) 16%, var(--cell));
		box-shadow: inset 0 0 0 2.5px var(--tint);
	}
	h2 {
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	.value {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-family: var(--font-rounded);
	}
	.value.first {
		flex-direction: row-reverse;
		justify-content: flex-end;
	}
	.n {
		font-size: 44px;
		line-height: 50px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}
	.n.empty {
		color: var(--label-3);
	}
	.unit {
		font-size: 22px;
		font-weight: 600;
		color: var(--label-2);
	}
	.range {
		font-size: 12px;
		line-height: 16px;
		color: var(--label-2);
	}
	.chips {
		display: flex;
		gap: 6px;
		height: 44px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}
	.stepper,
	.foot {
		display: flex;
		gap: 8px;
	}
	.stepper button,
	.foot button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 52px;
		border-radius: 14px;
		background: var(--fill-2);
		color: var(--label);
		font-size: 17px;
		font-weight: 600;
		touch-action: none;
	}
	.stepper .sign {
		flex: 0 0 calc((100% - 16px) / 3);
		font-family: var(--font-rounded);
		font-size: 26px;
	}
	.foot .next {
		flex: 2;
		background: var(--tint);
		color: var(--on-tint);
	}
	/* Night: no bright slab. */
	:global(.ios-night) .foot .next {
		background: transparent;
		box-shadow: inset 0 0 0 2.5px var(--tint);
		color: var(--tint);
	}
	/* Next on the rail's side. */
	[data-hand='left'] .foot {
		flex-direction: row-reverse;
	}
	.stepper button:active,
	.foot button:active:not(:disabled) {
		background: var(--label);
		color: var(--bg);
	}
	.foot button:disabled {
		opacity: 0.35;
	}
	button:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: 2px;
	}

	/* A phone-width window: the tile shows what is typed, so no header; shorter keys. */
	.number-dock[data-form='compact'] {
		--key-h: 46px;
		gap: 8px;
		margin: 0;
		padding: 8px 12px;
	}
	[data-form='compact'] header {
		display: none;
	}
	[data-form='compact'] .stepper button,
	[data-form='compact'] .foot button {
		height: 44px;
	}
</style>
