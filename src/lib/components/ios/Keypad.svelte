<script lang="ts">
	// Our own number keypad: the system keyboard never shows. Phone order, the point and delete on
	// the last row. Keys answer on pointer down, at once, with no easing. The typing itself is
	// pure, in ios/keypad.ts: this only sends keys. `point` false dims the point (whole numbers).
	import { Delete } from '@lucide/svelte';
	import type { Key } from '$lib/ios/keypad';

	let {
		onkey,
		point = true,
		labels
	}: { onkey: (key: Key) => void; point?: boolean; labels: { keypad: string; point: string; back: string } } = $props();

	const digits: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

	// Pointer down types, at once. A click with no pointer behind it (a keyboard, assistive tech:
	// `detail` 0) types too.
	function down(e: PointerEvent, key: Key) {
		if (e.button === 0) onkey(key);
	}
	function click(e: MouseEvent, key: Key) {
		if (e.detail === 0) onkey(key);
	}
</script>

<div class="ios-keypad" role="group" aria-label={labels.keypad}>
	{#each digits as d (d)}
		<button type="button" class="num" onpointerdown={(e) => down(e, d)} onclick={(e) => click(e, d)}>{d}</button>
	{/each}
	<button type="button" class="alt" aria-label={labels.point} disabled={!point} onpointerdown={(e) => down(e, '.')} onclick={(e) => click(e, '.')}>.</button>
	<button type="button" class="num" onpointerdown={(e) => down(e, '0')} onclick={(e) => click(e, '0')}>0</button>
	<button type="button" class="alt" aria-label={labels.back} onpointerdown={(e) => down(e, 'back')} onclick={(e) => click(e, 'back')}><Delete class="size-7" strokeWidth={1.8} /></button>
</div>

<style>
	.ios-keypad {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	button {
		display: flex;
		align-items: center;
		justify-content: center;
		height: var(--key-h, 60px);
		border-radius: 14px;
		background: var(--cell-elevated);
		box-shadow: inset 0 0 0 var(--hairline) var(--separator);
		color: var(--label);
		font-family: var(--font-rounded);
		font-size: 28px;
		font-weight: 500;
		touch-action: none;
	}
	button.alt {
		background: var(--fill-3);
		box-shadow: none;
	}
	button:active:not(:disabled) {
		background: var(--label);
		color: var(--bg);
	}
	button:disabled {
		color: var(--label-3);
	}
	button:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: 2px;
	}
</style>
