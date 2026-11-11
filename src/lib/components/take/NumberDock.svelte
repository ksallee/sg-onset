<script lang="ts">
	// Number entry, in the dock beside the rail, under the same thumb: the field and what is typed,
	// recent values as chips (one tap sets), our keypad with its stepper (hold to repeat), then
	// Next and Done. Next is on the rail's side. The rows keep their height from field to field
	// and the stepper always has its three keys, so no key ever moves. Nothing waits on motion: a
	// press types and shows at once, what moves after it is only feedback. The digits, the stepper
	// and delete do not mirror with the hand: a keypad is read by position.
	import { untrack } from 'svelte';
	import Chip from '$lib/components/ios/Chip.svelte';
	import Keypad from '$lib/components/ios/Keypad.svelte';
	import { t } from '$lib/i18n/messages';
	import type { Form, Hand } from '$lib/ios/handedness';
	import { canStep, entryValue, maxChars } from '$lib/ios/keypad';
	import { formatField, nextField } from '$lib/take/fields';
	import type { TakeScreen } from '$lib/take/screen.svelte';

	let { screen, form, hand, gloves }: { screen: TakeScreen; form: Form; hand: Hand; gloves: boolean } = $props();

	const spec = $derived(screen.spec);
	// The chips as they were when the field opened: a pick puts its value first in the session's
	// list, and a chip must not move under the finger while the keypad is open.
	const recents = $derived.by(() => {
		const s = screen.spec;
		return s ? untrack(() => screen.session.recents[s.key].filter((v) => v >= s.min && v <= s.max)) : [];
	});
	const typed = $derived(spec ? entryValue(screen.entry, spec) : null);
	const last = $derived(!screen.field || nextField(screen.field, screen.lens) === null);
</script>

{#if spec}
	<section class="number-dock" data-form={form} data-hand={hand} class:gloves aria-label={t(spec.label)}>
		<header>
			<h2>{t(spec.label)}</h2>
			<!-- Each character is its own box, so only the one that changed comes in. Sized for the longest text the field can hold. -->
			<p class="value num" class:first={spec.unitFirst} style:--chars={maxChars(spec)} aria-hidden="true">
				<span class="n" class:empty={!screen.entry.text}>
					{#each [...(screen.entry.text || '–')] as ch, i (`${i}${ch}`)}<span class="ch">{ch}</span>{/each}
				</span>
				<span class="unit">{t(spec.unit)}</span>
			</p>
			<p class="sr-only" role="status">{screen.entry.text || t('take.empty')} {t(spec.unit)}</p>
			<p class="range num">{t('keypad.range', { min: formatField(spec.min, spec), max: formatField(spec.max, spec) })}</p>
		</header>

		<div class="chips" role="group" aria-label={t('keypad.recent')}>
			{#each recents as v (v)}
				<Chip on={v === typed} onclick={() => screen.pickRecent(v)}>{formatField(v, spec)}</Chip>
			{/each}
		</div>

		<Keypad
			onkey={(k) => screen.press(k)}
			point={spec.decimals > 0}
			sign={spec.min < 0}
			canBack={screen.entry.text !== ''}
			onstep={(dir) => screen.step(dir)}
			canLess={canStep(typed, -1, spec)}
			canMore={canStep(typed, 1, spec)}
			onnext={() => screen.nextField()}
			ondone={() => screen.closeField()}
			labels={{ keypad: t('keypad.label'), point: t('keypad.point'), back: t('keypad.back'), sign: t('keypad.sign'), less: t('keypad.less'), more: t('keypad.more') }}
		/>

		<div class="foot">
			<button type="button" class="done" onclick={() => screen.closeField()}>{t('keypad.done')}</button>
			<button type="button" class="next" disabled={last} onclick={() => screen.nextField()}>{t('keypad.next')}</button>
		</div>
	</section>
{/if}

<style>
	.number-dock {
		--key-h: 60px;
		--step-h: 52px;
		--foot-h: 52px;
		--chip-h: 44px;
		/* What the field being typed sits on. */
		--on-bg: color-mix(in srgb, var(--tint) 16%, var(--cell));
		display: flex;
		flex-direction: column;
		gap: 10px;
		/* The middle of the keys (stepper and digits) at 45 % of the dock's height, where the thumb
		   rests. Above it: the padding, the header and the gaps (150 px), the chips, half the
		   stepper row and two rows of digits. Top of the dock when it is short. */
		margin-top: max(0px, calc(45cqh - 150px - var(--chip-h) - var(--step-h) / 2 - 2 * var(--key-h)));
		padding: 12px;
	}
	/* Gloves: 20 mm keys (104 px on an iPad) where the dock is tall enough, never under 72 px. The
	   dock is 304 px wide, so a key is 88 px across: 17 mm. The rows around the digits grow too. */
	.number-dock.gloves {
		--key-h: clamp(72px, calc((100cqh - 372px) / 4), 104px);
		--step-h: 64px;
		--foot-h: 64px;
		--chip-h: 52px;
		--chip-font: 21px;
	}
	/* Night: red on the dark cell, never on a red ground. */
	:global(.ios-night) .number-dock {
		--on-bg: var(--cell);
	}
	header {
		padding: 10px 14px 8px;
		border-radius: 18px;
		background: var(--on-bg);
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
		height: 50px;
		font-family: var(--font-rounded);
		white-space: nowrap;
	}
	.value.first {
		flex-direction: row-reverse;
		justify-content: flex-end;
	}
	.n {
		/* 44 px, or what lets the longest text fit beside the unit: the line never wraps or clips. */
		font-size: min(44px, calc((100cqw - 110px) / (var(--chars) * 0.62)));
		line-height: 50px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}
	.n.empty {
		color: var(--label-3);
	}
	/* A character that changed settles in from just below. It is there at full strength on the
	   first frame: a held stepper changes it 25 times a second and it must stay readable. */
	.ch {
		display: inline-block;
		transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
	}
	@starting-style {
		.ch {
			transform: translateY(0.14em);
		}
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
	:global(.ios-night) .unit,
	:global(.ios-night) .range,
	:global(.ios-night) h2 {
		color: var(--label);
	}
	.chips {
		display: flex;
		gap: 6px;
		/* Room for a chip's focus ring; the row keeps its height with no chips. */
		height: calc(var(--chip-h) + 8px);
		margin: -4px;
		padding: 4px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		touch-action: pan-x;
		/* A chip cut by the edge fades out: there is more that way. */
		mask-image: linear-gradient(to right, transparent, #000 4px, #000 calc(100% - 24px), transparent);
	}
	.chips::-webkit-scrollbar {
		display: none;
	}
	/* The last chip scrolls clear of the fade. */
	.chips::after {
		content: '';
		flex: none;
		width: 18px;
	}
	.foot {
		display: flex;
		gap: 8px;
	}
	.foot button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: var(--foot-h);
		border-radius: 14px;
		background: var(--fill-2);
		color: var(--label);
		font-size: 17px;
		font-weight: 600;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
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
	.foot button:active:not(:disabled) {
		background: var(--label);
		color: var(--bg);
		box-shadow: none;
	}
	:global(.ios-night) .foot button:active:not(:disabled) {
		background: var(--tint);
	}
	.foot button:disabled {
		opacity: 0.35;
	}
	.foot button:focus-visible {
		outline: 3px solid var(--tint);
		outline-offset: 2px;
	}

	/* A phone-width window: the tile shows what is typed, so no header; shorter keys. */
	.number-dock[data-form='compact'] {
		--key-h: 46px;
		--step-h: 44px;
		--foot-h: 44px;
		--chip-h: 44px;
		--chip-font: 19px;
		gap: 8px;
		margin: 0;
		padding: 8px 12px;
	}
	[data-form='compact'] header {
		display: none;
	}

	:global([data-motion='reduced']) .ch {
		transition: none;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(:root:not([data-motion='full'])) .ch {
			transition: none;
		}
	}
</style>
