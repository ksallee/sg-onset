<script lang="ts">
	// Our own number keypad: the system keyboard never shows. Phone order, the point and delete on
	// the last row; with `onstep`, a row of less, plus or minus and more above the digits. The
	// typing itself is pure, in ios/keypad.ts: this only sends keys.
	//
	// A key answers on pointer down, once, whatever follows. Each key is its whole grid cell, so
	// no press lands between two keys; the cap drawn in it is smaller. A press shows on the first
	// frame and never waits on motion: the cap goes to ink at once and eases back on release.
	// Delete and the stepper repeat while held, faster with time, and stop on pointer up, cancel
	// or leave, when the page hides, and at the end of the range. Two fingers down at once both
	// type, in order. A palm does not (ios/target.ts). A hardware keyboard types too: digits, the
	// point, minus, Backspace, the arrows for the stepper, Enter for `onnext`, Escape for `ondone`,
	// but not while a layer opened after it is on top (layer.svelte.ts): the keys are that layer's.
	import { Delete, Minus, Plus } from '@lucide/svelte';
	import { hardwareKey, repeatDelay, type Key } from '$lib/ios/keypad';
	import { isPalm } from '$lib/ios/target';
	import { overlays } from './layer.svelte';

	type Id = Key | 'less' | 'more';

	let {
		onkey,
		point = true,
		sign = false,
		canBack = true,
		onstep,
		canLess = true,
		canMore = true,
		onnext,
		ondone,
		labels
	}: {
		onkey: (key: Key) => void;
		/** False: whole numbers, the point is off. */
		point?: boolean;
		/** True: the field goes below zero, plus or minus is on. Shown only with `onstep`. */
		sign?: boolean;
		/** False: nothing to delete, delete is off. */
		canBack?: boolean;
		/** Given: the stepper row shows. One step down (-1) or up (1). */
		onstep?: (dir: 1 | -1) => void;
		/** False at the end of the range: the key is off, a held one stops. */
		canLess?: boolean;
		canMore?: boolean;
		/** Enter on a hardware keyboard. */
		onnext?: () => void;
		/** Escape on a hardware keyboard. */
		ondone?: () => void;
		labels: { keypad: string; point: string; back: string; sign?: string; less?: string; more?: string };
	} = $props();

	const digits: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
	const REPEATS: ReadonlySet<Id> = new Set<Id>(['back', 'less', 'more']);
	/** A press shows at least this long, so a tap too short to see is seen. */
	const SHOW_MS = 80;
	/** How long after a pointer ends its click is still taken for its own. */
	const CLICK_MS = 500;

	let pressed = $state<Partial<Record<Id, boolean>>>({});
	let repeating = $state<Id | null>(null);

	/** The key each pointer went down on, until it lifts: a finger that slides off still owns its click. */
	const pointers = new Map<number, Id>();
	/** Keys whose next click belongs to a pointer that already typed. */
	const taken = new Map<Id, ReturnType<typeof setTimeout> | undefined>();
	const shownAt = new Map<Id, number>();
	const hiding = new Map<Id, ReturnType<typeof setTimeout>>();
	const keysDown = new Map<string, Id>();
	/** Keys a held finger has slid off: no longer shown, the pointer still down somewhere. */
	const left = new Set<Id>();
	let rep: { id: Id; pointer: number; done: number; timer: ReturnType<typeof setTimeout> } | null = null;
	/** The focus was last moved by Tab, not by a pointer. */
	let tabbed = false;
	/** The layers open when the keypad came: one more is over it. */
	const depth = overlays.ids.length;

	function enabled(id: Id): boolean {
		if (id === '.') return point;
		if (id === 'sign') return sign;
		if (id === 'back') return canBack;
		if (id === 'less') return !!onstep && canLess;
		if (id === 'more') return !!onstep && canMore;
		return true;
	}

	function fire(id: Id): boolean {
		if (!enabled(id)) return false;
		if (id === 'less') onstep?.(-1);
		else if (id === 'more') onstep?.(1);
		else onkey(id);
		return true;
	}

	function show(id: Id) {
		clearTimeout(hiding.get(id));
		hiding.delete(id);
		shownAt.set(id, performance.now());
		pressed[id] = true;
	}

	function hide(id: Id) {
		if ([...pointers.values(), ...keysDown.values()].includes(id) && !left.has(id)) return;
		const wait = SHOW_MS - (performance.now() - (shownAt.get(id) ?? 0));
		clearTimeout(hiding.get(id));
		if (wait <= 0) pressed[id] = false;
		else hiding.set(id, setTimeout(() => ((pressed[id] = false), hiding.delete(id)), wait));
	}

	function startRepeat(id: Id, pointer: number) {
		stopRepeat();
		rep = { id, pointer, done: 0, timer: setTimeout(tick, repeatDelay(0)) };
	}
	function tick() {
		if (!rep) return;
		if (!fire(rep.id)) return stopRepeat();
		rep.done++;
		repeating = rep.id;
		rep.timer = setTimeout(tick, repeatDelay(rep.done));
	}
	function stopRepeat(pointer?: number) {
		if (!rep || (pointer !== undefined && rep.pointer !== pointer)) return;
		clearTimeout(rep.timer);
		rep = null;
		repeating = null;
	}

	function down(e: PointerEvent, id: Id) {
		if (e.button !== 0 || isPalm(e)) return;
		// A touch is captured by the key it lands on: let go, so sliding off is a leave.
		const el = e.currentTarget as Element;
		if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
		pointers.set(e.pointerId, id);
		left.delete(id);
		clearTimeout(taken.get(id));
		taken.set(id, undefined);
		if (!fire(id)) return;
		show(id);
		if (REPEATS.has(id)) startRepeat(id, e.pointerId);
	}

	/** The finger slid off the key: what it typed stays, the key lets go, a repeat stops. */
	function leave(e: PointerEvent, id: Id) {
		if (pointers.get(e.pointerId) !== id) return;
		left.add(id);
		stopRepeat(e.pointerId);
		hide(id);
	}

	/** The pointer lifted or was cancelled, anywhere. */
	function end(pointerId: number) {
		const id = pointers.get(pointerId);
		if (id === undefined) return;
		pointers.delete(pointerId);
		stopRepeat(pointerId);
		left.delete(id);
		hide(id);
		clearTimeout(taken.get(id));
		taken.set(
			id,
			setTimeout(() => taken.delete(id), CLICK_MS)
		);
	}

	/** Everything lets go: the page hid, the window lost focus, the keypad closed. */
	function endAll() {
		for (const pointerId of [...pointers.keys()]) end(pointerId);
		stopRepeat();
		const held = new Set(keysDown.values());
		keysDown.clear();
		held.forEach(hide);
	}

	/** A click with no pointer of ours behind it (a keyboard, assistive tech) types. A pointer's own click never types twice. */
	function click(id: Id) {
		if (taken.has(id)) {
			clearTimeout(taken.get(id));
			taken.delete(id);
			return;
		}
		if (!fire(id)) return;
		show(id);
		hide(id);
	}

	function keydown(e: KeyboardEvent) {
		if (e.defaultPrevented || e.isComposing || overlays.ids.length > depth) return;
		const at = e.target instanceof Element ? e.target : null;
		if (at?.closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'Tab') tabbed = true;
		const k = hardwareKey(e);
		if (k === null) return;
		if (k === 'next' || k === 'done') {
			// Enter on a control that Tab moved to presses that control. A control that only holds
			// the focus from a click (the cell that opened the keypad) does not take it.
			if (k === 'next' && tabbed && at?.closest('button, a, [role="button"]')) return;
			const run = k === 'next' ? onnext : ondone;
			if (!run) return;
			e.preventDefault();
			if (!e.repeat) run();
			return;
		}
		// The arrows stay with a control that moves by them.
		if ((k === 'less' || k === 'more') && at?.closest('[role="radio"], [role="slider"], [role="tab"], [role="option"], [role="menuitem"]')) return;
		if (k === 'clear') {
			e.preventDefault();
			return onkey('clear');
		}
		if (!fire(k)) return;
		e.preventDefault();
		keysDown.set(e.code, k);
		show(k);
	}
	function keyup(e: KeyboardEvent) {
		const id = keysDown.get(e.code);
		if (id === undefined) return;
		keysDown.delete(e.code);
		hide(id);
	}

	// No pinch, no callout and no menu from the keypad. `gesturestart` is Safari's own.
	function quiet(node: HTMLElement) {
		const stop = (e: Event) => e.preventDefault();
		node.addEventListener('gesturestart', stop);
		node.addEventListener('contextmenu', stop);
		return () => {
			node.removeEventListener('gesturestart', stop);
			node.removeEventListener('contextmenu', stop);
		};
	}

	$effect(() => () => {
		endAll();
		for (const t of [...taken.values(), ...hiding.values()]) clearTimeout(t);
	});
</script>

<svelte:window onpointerdown={() => (tabbed = false)} onpointerup={(e) => end(e.pointerId)} onpointercancel={(e) => end(e.pointerId)} onblur={endAll} onpagehide={endAll} onkeydown={keydown} onkeyup={keyup} />
<svelte:document onvisibilitychange={() => document.hidden && endAll()} />

{#snippet glyph(id: Id)}
	{#if id === 'back'}
		<Delete class="icon" strokeWidth={1.8} />
	{:else if id === 'less'}
		<Minus class="icon" strokeWidth={2.4} />
	{:else if id === 'more'}
		<Plus class="icon" strokeWidth={2.4} />
	{:else if id === '.'}
		<span class="dot"></span>
	{:else if id === 'sign'}
		±
	{:else}
		{id}
	{/if}
{/snippet}

{#snippet key(id: Id, kind: string, label?: string)}
	<button
		type="button"
		class="key {kind}"
		data-key={id}
		data-pressed={pressed[id] ? '' : undefined}
		data-repeating={repeating === id ? '' : undefined}
		aria-label={label}
		aria-disabled={enabled(id) ? undefined : true}
		onpointerdown={(e) => down(e, id)}
		onpointerleave={(e) => leave(e, id)}
		onclick={() => click(id)}
	>
		<span class="cap">
			<span class="face">{@render glyph(id)}</span>
			<span class="ink" aria-hidden="true">{@render glyph(id)}</span>
		</span>
	</button>
{/snippet}

<div class="ios-keypad" role="group" aria-label={labels.keypad} {@attach quiet}>
	{#if onstep}
		{@render key('less', 'step', labels.less)}
		{@render key('sign', 'step', labels.sign)}
		{@render key('more', 'step', labels.more)}
	{/if}
	{#each digits as d (d)}
		{@render key(d, 'num')}
	{/each}
	{@render key('.', 'alt', labels.point)}
	{@render key('0', 'num')}
	{@render key('back', 'alt', labels.back)}
</div>

<style>
	.ios-keypad {
		/* The space between two caps. Each key takes half of it on every side. */
		--key-gap: 8px;
		--ink: var(--key-pressed);
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: calc(var(--key-gap) / -2);
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
	}
	.key {
		display: block;
		height: calc(var(--key-h, 60px) + var(--key-gap));
		padding: calc(var(--key-gap) / 2);
		color: var(--key-label);
		font-family: var(--font-rounded);
		font-size: clamp(28px, calc(var(--key-h, 60px) * 0.4), 40px);
		font-weight: 500;
		line-height: 1;
		cursor: default;
		outline: none;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
	}
	.key.step {
		height: calc(var(--step-h, 52px) + var(--key-gap));
	}

	.cap,
	.face,
	.ink {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.cap {
		position: relative;
		width: 100%;
		height: 100%;
		border-radius: 14px;
		background: var(--key);
		box-shadow: var(--shadow-1);
		transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
	}
	.alt .cap {
		background: var(--key-alt);
		box-shadow: none;
	}
	.step .cap {
		background: var(--fill-2);
		box-shadow: none;
	}
	.key :global(.icon) {
		width: 1em;
		height: 1em;
	}
	.dot {
		width: 0.27em;
		height: 0.27em;
		margin-top: 0.36em;
		border-radius: 50%;
		background: currentColor;
	}

	/* Pressed: the key inverts (--key-pressed). Night fills nothing brightly: a ring says it too. On at once, off with an ease. */
	.ink {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--ink);
		color: var(--key-pressed-label);
		box-shadow: inset 0 0 0 var(--state-ring) var(--key-pressed-label);
		opacity: 0;
		transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
	}
	.key[data-pressed] .ink {
		opacity: 1;
		transition-duration: 0s;
	}
	.key[data-pressed] .cap {
		transform: scale(0.94);
		transition-duration: 0s;
	}

	/* Repeating: a second line inside the ink, so a held key that runs is not a held key that waits. */
	.ink::after {
		content: '';
		position: absolute;
		inset: 5px;
		border-radius: 9px;
		box-shadow: inset 0 0 0 3px var(--key-pressed-label);
		opacity: 0;
		transform: scale(0.92);
		transition:
			opacity 120ms ease-out,
			transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
	}
	.key[data-repeating] .ink::after {
		opacity: 1;
		transform: none;
	}

	/* Off: no cap, an outline and a dim glyph. */
	.key[aria-disabled='true'] .cap {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--separator);
		color: var(--label-3);
	}
	:global([data-night='true']) .key[aria-disabled='true'] .cap,
	:global(.ios-night) .key[aria-disabled='true'] .cap {
		color: var(--label-2);
	}

	.key:focus-visible .cap {
		outline: 3px solid var(--focus);
		outline-offset: 1px;
	}

	/* Reduced motion (the app's setting, or the system's until the app says full): states switch, nothing moves. */
	:global([data-motion='reduced']) .cap,
	:global([data-motion='reduced']) .ink,
	:global([data-motion='reduced']) .ink::after {
		transition: none !important;
		transform: none !important;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(:root:not([data-motion='full'])) .cap,
		:global(:root:not([data-motion='full'])) .ink,
		:global(:root:not([data-motion='full'])) .ink::after {
			transition: none !important;
			transform: none !important;
		}
	}
</style>
