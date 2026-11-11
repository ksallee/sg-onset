<script lang="ts">
	// The iOS stepper: a − | + pill. Holding a half repeats (after 400 ms, every 100 ms; by
	// `bigStep` when given, e.g. ±5 min). One spinbutton for assistive tech and keys: arrows step,
	// Page Up / Down by bigStep, Home and End go to min and max. Show the value elsewhere (a row's
	// detail); `format` is what is read out.
	import { Minus, Plus } from '@lucide/svelte';

	let {
		value,
		min = -Infinity,
		max = Infinity,
		step = 1,
		bigStep,
		onchange,
		format = (v: number) => String(v),
		label
	}: { value: number; min?: number; max?: number; step?: number; bigStep?: number; onchange: (value: number) => void; format?: (v: number) => string; label: string } = $props();

	const clamp = (v: number) => Math.min(max, Math.max(min, v));
	/** The value as last sent: repeats run ahead of the parent's update. */
	let current = 0;
	$effect.pre(() => {
		current = value;
	});
	function by(d: number) {
		const next = clamp(Math.round((current + d) / step) * step);
		if (next === current) return false;
		current = next;
		onchange(next);
		return true;
	}

	let hold: ReturnType<typeof setTimeout> | undefined;
	let repeat: ReturnType<typeof setInterval> | undefined;
	function press(e: PointerEvent, dir: 1 | -1) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		stop();
		by(dir * step);
		hold = setTimeout(() => {
			repeat = setInterval(() => {
				if (!by(dir * (bigStep ?? step))) stop();
			}, 100);
		}, 400);
	}
	function stop() {
		clearTimeout(hold);
		clearInterval(repeat);
	}
	function key(e: KeyboardEvent) {
		const big = bigStep ?? step * 10;
		const moves: Record<string, () => void> = {
			ArrowUp: () => by(step),
			ArrowRight: () => by(step),
			ArrowDown: () => by(-step),
			ArrowLeft: () => by(-step),
			PageUp: () => by(big),
			PageDown: () => by(-big),
			Home: () => Number.isFinite(min) && by(min - current),
			End: () => Number.isFinite(max) && by(max - current)
		};
		const m = moves[e.key];
		if (!m) return;
		e.preventDefault();
		m();
	}
</script>

<div
	class="ios-stepper"
	role="spinbutton"
	tabindex="0"
	aria-label={label}
	aria-valuenow={value}
	aria-valuemin={Number.isFinite(min) ? min : undefined}
	aria-valuemax={Number.isFinite(max) ? max : undefined}
	aria-valuetext={format(value)}
	onkeydown={key}
>
	<button type="button" tabindex="-1" aria-hidden="true" disabled={value <= min} onpointerdown={(e) => press(e, -1)} onpointerup={stop} onpointercancel={stop} onlostpointercapture={stop}><Minus class="size-[18px]" strokeWidth={2.4} /></button>
	<span class="div" aria-hidden="true"></span>
	<button type="button" tabindex="-1" aria-hidden="true" disabled={value >= max} onpointerdown={(e) => press(e, 1)} onpointerup={stop} onpointercancel={stop} onlostpointercapture={stop}><Plus class="size-[18px]" strokeWidth={2.4} /></button>
</div>

<style>
	.ios-stepper {
		flex: none;
		display: inline-flex;
		align-items: center;
		height: 32px;
		border-radius: 8px;
		background: var(--fill-3);
		outline: none;
	}
	.ios-stepper:focus-visible {
		box-shadow: 0 0 0 2px var(--focus);
	}
	button {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 47px;
		height: 32px;
		color: var(--label);
		border-radius: 8px;
		transition: background-color var(--dur-press);
		touch-action: none;
	}
	button::after {
		content: '';
		position: absolute;
		inset: -6px 0;
	}
	button:active:not(:disabled) {
		background: var(--fill);
		transition: none;
	}
	button:disabled {
		color: var(--label-3);
	}
	.div {
		width: 1px;
		height: 18px;
		background: var(--separator);
	}
</style>
