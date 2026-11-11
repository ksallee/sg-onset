<script lang="ts">
	// Number entry, in the dock beside the rail, under the same thumb: the field, whose camera it
	// is and what is typed; start or end for a value that changes over a take; recent values of the
	// slate as chips (one tap stores); our keypad with its stepper (hold to repeat), then Next and
	// Done. Feet and inches get their two marks; focus gets infinity. Next is on the rail's side.
	// The rows keep their height from field to field, so no key moves. Nothing waits on motion.
	import { untrack } from 'svelte';
	import Chip from '$lib/components/ios/Chip.svelte';
	import Keypad from '$lib/components/ios/Keypad.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { fieldLabel } from '$lib/i18n/modelText';
	import type { Form, Hand } from '$lib/ios/handedness';
	import { formatNumber, maxChars } from '$lib/ios/keypad';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import { unitText } from './labels';

	let { shoot, form, hand, gloves }: { shoot: Shoot; form: Form; hand: Hand; gloves: boolean } = $props();

	const field = $derived(shoot.field);
	const es = $derived(shoot.spec);
	const units = $derived(settings.value.units);
	const unit = $derived(field ? unitText(field.def, units) : '');
	const camera = $derived(field ? shoot.columns.find((c) => c.id === field.setupId)?.label : undefined);
	// The chips as they were when the field opened: a chip must not move under the finger.
	const recents = $derived.by(() => {
		void shoot.field;
		return untrack(() => shoot.recents);
	});
	const text = $derived(shoot.entry.text === 'inf' ? '∞' : shoot.entry.text);
	const chars = $derived(es ? (es.mode === 'feetInches' ? 9 : maxChars(es.spec)) : 6);
	const range = $derived(es && es.mode === 'number' ? t('keypad.range', { min: formatNumber(es.spec.min, es.spec.decimals), max: formatNumber(es.spec.max, es.spec.decimals) }) : '');
</script>

{#if field && es}
	<section class="number-dock" data-form={form} data-hand={hand} class:gloves aria-label={fieldLabel(field.def, field.end)}>
		<header class:issue={!!shoot.issue}>
			<h2><span>{fieldLabel(field.def)}</span>{#if camera}<span class="cam">{t('take.setup', { id: camera })}</span>{/if}</h2>
			<p class="value num" style:--chars={chars} aria-hidden="true">
				<span class="n" class:empty={!text}>
					{#each [...(text || '–')] as ch, i (`${i}${ch}`)}<span class="ch">{ch}</span>{/each}
				</span>
				<span class="unit">{unit}</span>
			</p>
			<p class="sr-only" role="status">{text || t('take.empty')} {unit}</p>
			<p class="range num" class:issue={!!shoot.issue} role={shoot.issue ? 'alert' : undefined}>{shoot.issue ?? range}</p>
		</header>

		<div class="chips" role="group" aria-label={t('keypad.recent')}>
			{#each recents as r (r.text)}
				<Chip on={r.text === shoot.entry.text} onclick={() => shoot.pickRecent(r.value, r.text)}>{r.text === 'inf' ? '∞' : r.text}</Chip>
			{/each}
		</div>

		<!-- Always there, so the keys below never move: start or end, then the length marks. -->
		<div class="tools">
			{#if field.def.end}
				<div class="slot">
					<Segmented
						small
						label={t('keypad.slot')}
						value={field.end ? 'end' : 'start'}
						options={[
							{ value: 'start', label: t('keypad.slot.start') },
							{ value: 'end', label: t('keypad.slot.end') }
						]}
						onchange={(v) => shoot.setEnd(v === 'end')}
					/>
				</div>
			{/if}
			{#if es.mode === 'feetInches'}
				<button type="button" aria-label={t('keypad.feet')} onclick={() => shoot.key('feet')}>′</button>
				<button type="button" aria-label={t('keypad.inches')} onclick={() => shoot.key('inches')}>″</button>
			{/if}
			{#if es.infinity}<button type="button" aria-label={t('keypad.infinity')} onclick={() => shoot.key('inf')}>∞</button>{/if}
		</div>

		<Keypad
			onkey={(k) => shoot.key(k)}
			point={es.spec.decimals > 0}
			sign={es.spec.min < 0}
			canBack={shoot.entry.text !== ''}
			onstep={(dir) => shoot.step(dir)}
			canLess={shoot.canStep(-1)}
			canMore={shoot.canStep(1)}
			onnext={() => shoot.next()}
			ondone={() => shoot.close()}
			labels={{ keypad: t('keypad.label'), point: t('keypad.point'), back: t('keypad.back'), sign: t('keypad.sign'), less: t('keypad.less'), more: t('keypad.more') }}
		/>

		<div class="foot">
			<button type="button" class="done" onclick={() => shoot.close()}>{t('keypad.done')}</button>
			<button type="button" class="next" disabled={!shoot.hasNext()} onclick={() => shoot.next()}>{t('keypad.next')}</button>
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
		--on-bg: var(--tint-fill);
		display: flex;
		flex-direction: column;
		gap: 10px;
		/* The middle of the keys (stepper and digits) at 45 % of the dock's height, where the thumb
		   rests. Above it: the padding, the header and the gaps (150 px), the chips, half the
		   stepper row and two rows of digits. Top of the dock when it is short. */
		margin-top: max(0px, calc(45cqh - 160px - 2 * var(--chip-h) - var(--step-h) / 2 - 2 * var(--key-h)));
		padding: 12px;
	}
	/* Gloves: 20 mm keys (104 px on an iPad) where the dock is tall enough, never under 72 px. The
	   dock is 352 px wide at Large, so a key is about 104 px across. The rows around the digits grow too. */
	.number-dock.gloves {
		--key-h: clamp(72px, calc((100cqh - 372px) / 4), 104px);
		--step-h: 64px;
		--foot-h: 64px;
		--chip-h: 52px;
		--chip-font: 21px;
	}
	header {
		padding: 10px 14px 8px;
		border-radius: 18px;
		background: var(--on-bg);
		box-shadow: inset 0 0 0 2.5px var(--tint);
	}
	h2 {
		display: flex;
		justify-content: space-between;
		gap: 8px;
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
		height: 16px;
		overflow: hidden;
		font-size: 12px;
		line-height: 16px;
		color: var(--label-2);
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.range.issue {
		color: var(--record);
		font-weight: 700;
	}
	.cam {
		color: var(--label);
	}
	.tools {
		display: flex;
		gap: 6px;
		height: var(--chip-h);
	}
	.slot {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
	}
	.slot > :global(*) {
		width: 100%;
	}
	.tools button {
		flex: 0 0 52px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-left: auto;
		border-radius: 12px;
		background: var(--fill-3);
		color: var(--label);
		font-family: var(--font-rounded);
		font-size: 26px;
		font-weight: 600;
		touch-action: manipulation;
	}
	.tools button + button {
		margin-left: 0;
	}
	.tools button:active {
		background: var(--key-pressed);
		color: var(--key-pressed-label);
	}
	.tools button:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	:global([data-night='true']) .unit,
	:global([data-night='true']) .range,
	:global([data-night='true']) h2 {
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
		background: var(--tint-solid);
		color: var(--on-tint-solid);
		box-shadow: inset 0 0 0 var(--state-ring) var(--on-tint-solid);
	}
	/* Next on the rail's side. */
	[data-hand='left'] .foot {
		flex-direction: row-reverse;
	}
	.foot button:active:not(:disabled) {
		background: var(--key-pressed);
		color: var(--key-pressed-label);
		box-shadow: none;
	}
	.foot button:disabled {
		opacity: 0.35;
	}
	.foot button:focus-visible {
		outline: 3px solid var(--focus);
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
	[data-form='compact'] header:not(.issue) {
		display: none;
	}
	[data-form='compact'] header.issue :is(h2, .value) {
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
