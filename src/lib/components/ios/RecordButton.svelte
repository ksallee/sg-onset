<script lang="ts">
	// The start and end button of a take, on the action rail. It stamps the take's start, then
	// its end; it records nothing. (The file keeps its name for now; a rename is pending.)
	//
	// One physical press is one change (ios/press.ts). It fires on the way down, with the instant
	// the finger landed, and then takes no press for half a second, so a bounce or a double tap
	// cannot start and end a take. Sliding off, a touch cancel or leaving the page after the down
	// change nothing: the press is taken. The key `R` does the same on a desktop.
	//
	// The state reads without colour and without motion. Ready (`idle`): a ring with a disc.
	// Running (`rolling`): a filled square plate with a square in it, a second outline round it,
	// the word and the running time. Ended (`filed`): the ring and disc again, with a tick on the
	// corner. The time is `now - since`, looked at again on each whole second and when the page
	// comes back, so it cannot drift.
	//
	// Motion only follows: the change is on the first frame and nothing waits for an animation.
	// `data-motion="reduced"` on the root, or the system setting, stills all of it.
	import { RECORD_LOCKOUT_MS, idlePress, isShortcut, press, pressInstant, type PressEvent } from '$lib/ios/press';
	import { elapsedMs, formatElapsed, nextSecondIn, type Phase } from '$lib/take/record';

	let {
		rolling,
		phase: given,
		label,
		caption = label,
		detail = '',
		since = null,
		shortcut = 'r',
		lockout = RECORD_LOCKOUT_MS,
		onpress,
		onclick
	}: {
		rolling: boolean;
		/** `filed` (ended) adds the tick: the take on screen has its two stamps. From `rolling` unless given. */
		phase?: Phase;
		/** What the press does: Start, End. The accessible name is this and `detail`: "End take 3". */
		label: string;
		caption?: string;
		/** The second line and the rest of the accessible name: the take the press applies to. */
		detail?: string;
		/** The start stamp of the running take, epoch ms: the second line shows the time since. */
		since?: number | null;
		/** The key that presses it from a keyboard. Null: none. */
		shortcut?: string | null;
		lockout?: number;
		/** The press, with its instant (epoch ms): when the finger landed, not when this ran. */
		onpress?: (at: number) => void;
		/** The press, when `onpress` is not given. */
		onclick?: () => void;
	} = $props();

	const phase = $derived<Phase>(given ?? (rolling ? 'rolling' : 'idle'));
	let gate = $state.raw(idlePress);
	const pressed = $derived(gate.down.length > 0);

	function take(event: PressEvent, stamp: number) {
		const result = press(gate, event, { on: 'down', lockout });
		gate = result.state;
		if (!result.fire) return;
		if (onpress) onpress(pressInstant(Date.now(), performance.now(), stamp));
		else onclick?.();
	}

	const editable = (target: EventTarget | null) =>
		target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], [aria-modal="true"]') !== null);

	function onkey(e: KeyboardEvent) {
		if (e.defaultPrevented || e.shiftKey) return;
		if (!isShortcut({ key: e.key, repeat: e.repeat, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, editable: editable(e.target) }, shortcut)) return;
		e.preventDefault();
		take({ type: 'key', at: e.timeStamp, repeat: e.repeat }, e.timeStamp);
	}

	/** Enter or Space held on the button would click again and again: only the first counts. */
	function onbuttonkey(e: KeyboardEvent) {
		if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
	}

	const reset = () => take({ type: 'reset' }, 0);

	// The running time: always the wall clock less the start, never a count of ticks.
	let now = $state(Date.now());
	$effect(() => {
		const start = since;
		if (start === null) return;
		let timer: ReturnType<typeof setTimeout>;
		const look = () => {
			clearTimeout(timer);
			now = Date.now();
			timer = setTimeout(look, nextSecondIn(start, now) + 4);
		};
		look();
		document.addEventListener('visibilitychange', look);
		window.addEventListener('pageshow', look);
		window.addEventListener('focus', look);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', look);
			window.removeEventListener('pageshow', look);
			window.removeEventListener('focus', look);
		};
	});
	const timed = $derived(phase === 'rolling' && since !== null);
	const line = $derived(timed ? formatElapsed(elapsedMs({ start: since, end: null }, now)) : detail);
</script>

<svelte:window onkeydown={onkey} onblur={reset} onpagehide={reset} />
<svelte:document onvisibilitychange={reset} />

<button
	type="button"
	class="ios-record"
	data-phase={phase}
	data-pressed={pressed || undefined}
	aria-label={detail ? `${label} ${detail}` : label}
	aria-keyshortcuts={shortcut ? shortcut.toUpperCase() : undefined}
	onpointerdown={(e) => take({ type: 'down', id: e.pointerId, at: e.timeStamp, button: e.button, pointerType: e.pointerType }, e.timeStamp)}
	onpointerup={(e) => take({ type: 'up', id: e.pointerId, at: e.timeStamp }, e.timeStamp)}
	onpointercancel={(e) => take({ type: 'cancel', id: e.pointerId, at: e.timeStamp }, e.timeStamp)}
	onpointerleave={(e) => take({ type: 'leave', id: e.pointerId }, e.timeStamp)}
	onclick={(e) => take({ type: 'click', at: e.timeStamp }, e.timeStamp)}
	onkeydown={onbuttonkey}
	oncontextmenu={(e) => e.preventDefault()}
>
	<span class="face" aria-hidden="true">
		<span class="halo"></span>
		<span class="ring"></span>
		<span class="plate"></span>
		<span class="disc"></span>
		<span class="square"></span>
		<span class="tick">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
		</span>
	</span>
	<span class="caption">{caption}</span>
	<span class="detail num" class:timed aria-hidden={timed || undefined}>{line}</span>
</button>

<style>
	.ios-record {
		/* Motion, all on transform and opacity. Reduced: no movement, the shapes swap at once. */
		--t-press: 90ms;
		--t-release: 260ms;
		--t-morph: 220ms;
		--s-press: 0.93;
		--s-away: 0.6;
		--s-plate-away: 0.82;
		--breathe: ios-record-breathe 1.6s ease-in-out infinite alternate;
		--ease-out: cubic-bezier(0.23, 1, 0.32, 1);

		display: flex;
		flex-direction: column;
		align-items: center;
		flex: none;
		width: var(--target);
		color: var(--label);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(:root:not([data-motion='full'])) .ios-record {
			--t-press: 0ms;
			--t-release: 0ms;
			--t-morph: 0ms;
			--s-press: 1;
			--s-away: 1;
			--s-plate-away: 1;
			--breathe: none;
		}
	}
	:global(:root[data-motion='reduced']) .ios-record {
		--t-press: 0ms;
		--t-release: 0ms;
		--t-morph: 0ms;
		--s-press: 1;
		--s-away: 1;
		--s-plate-away: 1;
		--breathe: none;
	}

	.face {
		position: relative;
		width: var(--target);
		height: var(--target);
		margin-bottom: 10px;
		transition: transform var(--t-release) var(--ease-out);
	}
	[data-pressed] .face {
		transform: scale(var(--s-press));
		transition-duration: var(--t-press);
	}
	.face > span {
		position: absolute;
		transition:
			transform var(--t-morph) var(--ease-out),
			opacity var(--t-morph) var(--ease-out);
	}

	/* Ready and ended: a ring with a disc. */
	.ring {
		inset: 0;
		border-radius: 50%;
		border: 4px solid var(--label);
	}
	.disc {
		inset: 19%;
		border-radius: 50%;
		background: var(--record);
	}
	/* The press shows on the first frame, under and around the finger: the ring fills. */
	[data-pressed] .ring {
		background: var(--label);
	}

	/* Running: a filled plate, square where the ring was round, a square in it, a second outline. */
	.plate {
		inset: 0;
		border-radius: 24%;
		background: var(--record);
		opacity: 0;
		transform: scale(var(--s-plate-away));
	}
	.square {
		inset: 31%;
		border-radius: 14%;
		background: var(--on-record);
		opacity: 0;
		transform: scale(var(--s-away));
	}
	.halo {
		inset: -6px;
		border-radius: calc(24% + 5px);
		border: 3px solid var(--record);
		opacity: 0;
	}
	[data-phase='rolling'] .ring,
	[data-phase='rolling'] .disc {
		opacity: 0;
		transform: scale(var(--s-away));
	}
	[data-phase='rolling'] .plate,
	[data-phase='rolling'] .square {
		opacity: 1;
		transform: none;
	}
	[data-phase='rolling'] .halo {
		opacity: 1;
		animation: var(--breathe);
	}
	[data-phase='rolling'][data-pressed] .square {
		transform: scale(0.8);
		transition-duration: var(--t-press);
	}
	/* Calm: a breath every three seconds or so, never off, never a blink. */
	@keyframes ios-record-breathe {
		from {
			opacity: 1;
			transform: scale(1);
		}
		to {
			opacity: 0.35;
			transform: scale(1.045);
		}
	}

	/* Ended: the take has its two stamps. A tick on the corner; the next press starts a new one. */
	.tick {
		top: -5px;
		right: -5px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--label);
		color: var(--bg);
		box-shadow: 0 0 0 3px var(--bg-elevated);
		opacity: 0;
		transform: scale(var(--s-away));
	}
	[data-phase='filed'] .tick {
		opacity: 1;
		transform: none;
	}

	.ios-record:focus-visible {
		outline: none;
	}
	.ios-record:focus-visible .face {
		outline: 3px solid var(--tint);
		outline-offset: 10px;
		border-radius: 28%;
	}

	.caption {
		font-size: 14px;
		line-height: 16px;
		font-weight: 700;
		white-space: nowrap;
	}
	.detail {
		height: 18px;
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		white-space: nowrap;
	}
	/* Running: the word in capitals and the time large: read at arm's length, in any theme. */
	[data-phase='rolling'] .caption {
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	[data-phase='rolling'] .detail {
		font-size: 17px;
		font-weight: 700;
	}
</style>
