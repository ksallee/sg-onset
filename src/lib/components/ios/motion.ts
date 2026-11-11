// The kit's motion at run time: the thin layer between the pure maths (ios/spring.ts,
// ios/gesture.ts, ios/flip.ts), the tokens (theme/motion.ts) and the DOM. Rules: docs/design/motion.md.
//
// - A tap starts a Web Animation or a CSS transition with a spring as its easing: it runs off
//   the main thread and is retargeted from where the thing is drawn.
// - A finger drives a spring in code (`springDriver`): 1:1 while it drags, then on from the
//   finger's speed. It writes `transform` straight to the element, never through state.
// - Transform and opacity only. Reduced motion: nothing here moves anything.
import { flipDelta, listDiff, type Box } from '$lib/ios/flip';
import { springAtRest, springProgress, springStep, type Spring, type SpringState } from '$lib/ios/spring';
import { DURATIONS, EASINGS, SPRINGS, springCss, type SpringName } from '$lib/theme/motion';
import { reducedMotion } from './layer.svelte';

// ---------------------------------------------------------------- tap-driven: Web Animations

const running = new WeakMap<Element, Animation>();

/** Where an element is drawn against where its layout puts it: the transform in flight, px. */
export function drawnOffset(node: Element): { x: number; y: number } {
	const t = getComputedStyle(node).transform;
	if (!t || t === 'none') return { x: 0, y: 0 };
	const m = new DOMMatrixReadOnly(t);
	return { x: m.m41, y: m.m42 };
}

/**
 * Runs keyframes on `node` with a spring's easing and duration, in place of whatever this
 * module was running on it. Returns the animation, or null when nothing can or should move.
 */
export function animateSpring(node: Element, keyframes: Keyframe[], spring: SpringName = 'smooth', options: KeyframeAnimationOptions = {}): Animation | null {
	if (reducedMotion() || typeof node.animate !== 'function') return null;
	running.get(node)?.cancel();
	const { easing, duration } = springCss(spring);
	let animation: Animation;
	try {
		animation = node.animate(keyframes, { duration, easing, ...options });
	} catch {
		// No `linear()` easing in this browser: the nearest curve.
		animation = node.animate(keyframes, { duration, easing: EASINGS.ios, ...options });
	}
	running.set(node, animation);
	const done = () => running.get(node) === animation && running.delete(node);
	animation.finished.then(done, done);
	return animation;
}

/** Stops what this module runs on `node`: it is drawn where its layout puts it. */
export function settle(node: Element): void {
	running.get(node)?.cancel();
	running.delete(node);
}

/**
 * FLIP: `node` was drawn at `from` (viewport box, e.g. from `getBoundingClientRect` before the
 * change) and its layout now puts it elsewhere. It moves, and scales if `scale`, from there to
 * its place. Call after the DOM has changed.
 */
export function flipFrom(node: HTMLElement, from: Box, options: { spring?: SpringName; scale?: boolean } = {}): Animation | null {
	settle(node);
	const r = node.getBoundingClientRect();
	const d = flipDelta(from, { x: r.left, y: r.top, w: r.width, h: r.height });
	if (!d.moved) return null;
	const first = options.scale ? `translate(${d.dx}px, ${d.dy}px) scale(${d.sx}, ${d.sy})` : `translate(${d.dx}px, ${d.dy}px)`;
	return animateSpring(node, [{ transform: first, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], options.spring ?? 'smooth');
}

/** The viewport box of an element as it is drawn now. */
export function boxOf(node: Element): Box {
	const r = node.getBoundingClientRect();
	return { x: r.left, y: r.top, w: r.width, h: r.height };
}

// ---------------------------------------------------------------- finger-driven: a spring in code

export interface SpringDriver {
	/** Where it is, and how fast (per second). */
	readonly x: number;
	readonly v: number;
	readonly target: number;
	readonly moving: boolean;
	/** Puts it at `x` now, still: a drag following the finger, or a start position. */
	jump(x: number): void;
	/** Sends it to `target` from where it is; `velocity` (per second) is the finger's at release. */
	to(target: number, velocity?: number): void;
	stop(): void;
}

/**
 * A spring that writes a value every frame until it rests. `apply` gets the value: write a
 * transform or an opacity with it, nothing that asks for layout. `onrest` runs when it stops on
 * its target. It starts from where it is at the speed it has, so `to` mid-flight never jumps.
 */
export function springDriver(spring: Spring | SpringName, apply: (x: number) => void, onrest?: (target: number) => void): SpringDriver {
	const k = typeof spring === 'string' ? SPRINGS[spring] : spring;
	let state: SpringState = { x: 0, v: 0 };
	let target = 0;
	let frame = 0;
	let last = 0;
	const tick = (now: number) => {
		// A long frame (a tab coming back) is not a long step: the spring would land in one go.
		const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
		last = now;
		state = springStep(state, target, dt, k);
		if (springAtRest(state, target)) {
			state = { x: target, v: 0 };
			frame = 0;
			apply(target);
			onrest?.(target);
			return;
		}
		apply(state.x);
		frame = requestAnimationFrame(tick);
	};
	return {
		get x() {
			return state.x;
		},
		get v() {
			return state.v;
		},
		get target() {
			return target;
		},
		get moving() {
			return frame !== 0;
		},
		jump(x) {
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
			state = { x, v: 0 };
			target = x;
			apply(x);
		},
		to(next, velocity) {
			target = next;
			if (velocity !== undefined) state = { x: state.x, v: velocity };
			if (reducedMotion()) {
				if (frame) cancelAnimationFrame(frame);
				frame = 0;
				state = { x: next, v: 0 };
				apply(next);
				onrest?.(next);
				return;
			}
			if (frame) return;
			last = performance.now();
			frame = requestAnimationFrame(tick);
		},
		stop() {
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		}
	};
}

// ---------------------------------------------------------------- Svelte transitions

/** A spring as an easing function for a Svelte transition of `duration` ms. */
const springEase = (name: SpringName, duration: number) => (t: number) => (t >= 1 ? 1 : springProgress(SPRINGS[name], (t * duration) / 1000));

/**
 * A Svelte transition: fades and comes up `y` px to its place; out, it goes back the way it
 * came, sooner, taking no touch. `base` is a transform the element keeps (a centring translate).
 * `instant`: no motion at all (read when it runs). Reduced: a fade.
 * `<div in:rise={{ y: 12 }} out:rise={{ y: 8, exit: true }}>`
 */
export function rise(_node: Element, { y = 12, base = '', exit = false, instant = false }: { y?: number; base?: string; exit?: boolean; instant?: boolean } = {}) {
	// Leaving, it takes no touch: what is under it answers at once.
	const touch = exit ? 'pointer-events: none;' : '';
	if (instant) return { duration: 0 };
	if (reducedMotion()) return { duration: DURATIONS.fade, css: (t: number) => `${touch} opacity: ${t}` };
	const duration = exit ? DURATIONS.exit : springCss('smooth').duration;
	return {
		duration,
		easing: exit ? (t: number) => 1 - Math.pow(1 - t, 3) : springEase('smooth', duration),
		css: (t: number, u: number) => `${touch} opacity: ${Math.min(1, t * 1.6)}; transform: ${base} translate3d(0, ${u * y}px, 0)`
	};
}

// ---------------------------------------------------------------- lists

const GHOST = 'data-list-ghost';

/**
 * A list whose entries come, go and change place: `<div {@attach listMotion()}>` on the element
 * whose children are the entries (a keyed `{#each}`). The layout changes at once; then a new
 * entry fades in, a removed one fades out where it was while the others close the gap, and a
 * reordered or pushed one glides to its place. Children that move because another one grew are
 * followed too. Transform and opacity only; a change mid-flight starts from where things are
 * drawn. Reduced motion: nothing moves.
 */
export function listMotion(options: { disabled?: () => boolean } = {}) {
	return (node: HTMLElement) => {
		if (typeof MutationObserver === 'undefined' || typeof ResizeObserver === 'undefined' || typeof node.animate !== 'function') return;
		const entries = () => [...node.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute(GHOST));
		/** The layout box of each entry against the list: transforms in flight do not count. */
		const measure = () => new Map<HTMLElement, Box>(entries().map((c) => [c, { x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }]));
		let boxes = measure();
		const watched = new Set<Element>();

		function sync() {
			const before = boxes;
			boxes = measure();
			for (const c of boxes.keys()) {
				if (watched.has(c)) continue;
				watched.add(c);
				sizes.observe(c);
			}
			if (options.disabled?.() || reducedMotion()) return;
			const change = listDiff(before, boxes);
			for (const { key, dx, dy } of change.moved) {
				// Where it is drawn now is where it starts from, mid-flight or not.
				const drawn = drawnOffset(key);
				animateSpring(key, [{ transform: `translate(${dx + drawn.x}px, ${dy + drawn.y}px)` }, { transform: 'none' }], 'smooth');
			}
			for (const key of change.entered) {
				key.animate([{ opacity: 0 }, { opacity: 1 }], { duration: springCss('smooth').duration * 0.6, easing: EASINGS.out });
			}
			for (const key of change.left) {
				watched.delete(key);
				sizes.unobserve(key);
				const box = before.get(key);
				if (box) leave(key, box);
			}
		}

		/** The removed entry, drawn once more where it was, under the others, fading out. */
		function leave(gone: HTMLElement, box: Box) {
			const ghost = gone.cloneNode(true) as HTMLElement;
			ghost.setAttribute(GHOST, '');
			ghost.setAttribute('aria-hidden', 'true');
			ghost.inert = true;
			Object.assign(ghost.style, {
				position: 'absolute',
				left: `${box.x}px`,
				top: `${box.y}px`,
				width: `${box.w}px`,
				height: `${box.h}px`,
				margin: '0',
				zIndex: '-1',
				pointerEvents: 'none'
			});
			node.appendChild(ghost);
			const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATIONS.exit, easing: EASINGS.out, fill: 'forwards' });
			const remove = () => ghost.remove();
			fade.finished.then(remove, remove);
		}

		// The list is what its entries and their ghosts are placed against.
		if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
		node.style.isolation = 'isolate';

		const isGhost = (n: Node) => n instanceof HTMLElement && n.hasAttribute(GHOST);
		const changes = new MutationObserver((records) => {
			if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every(isGhost))) return;
			sync();
		});
		changes.observe(node, { childList: true });
		let first = true;
		const sizes = new ResizeObserver(() => {
			// The first report is the sizes as they are: nothing changed yet.
			if (first) return void (first = false);
			sync();
		});
		sizes.observe(node);
		for (const c of boxes.keys()) {
			watched.add(c);
			sizes.observe(c);
		}
		return () => {
			changes.disconnect();
			sizes.disconnect();
			for (const ghost of node.querySelectorAll(`:scope > [${GHOST}]`)) ghost.remove();
		};
	};
}
