// A change of page, moved. The stage is the element that holds the page (`data-page-stage`, in
// NavShell: the navigation stays put beside it). Before the page changes, `leave` keeps a still
// picture of the one that is going (a clone, the "ghost"); once the new one is there, `arrive`
// moves the two: a push slides the new page in from the right over the old, a pop slides the old
// one off to the right, a change of destination fades the new one in over the old.
//
// Why not View Transitions: a new one cuts the one in flight short, the page is frozen while one
// starts, and WebKit left one unfinished when the sidebar changed width under it. Here the new
// page is live from its first frame, nothing waits, and a second navigation mid-flight starts
// from where things are drawn: back during a push turns the push around.
//
// Transform and opacity only, as Web Animations with the page spring: off the main thread, so
// the page that is mounting does not make it stutter. Pure choice of the move: ios/direction.ts.
import type { NavDirection } from '$lib/ios/direction';
import { DURATIONS, EASINGS, springCss } from '$lib/theme/motion';

const STAGE = '[data-page-stage]';
const PIN = '[data-page-pin]';
/** How far the page under moves, as a share of the width, and how dark it gets. */
const PARALLAX = 0.3;
const DIM = 0.12;
/** A ghost never outlives this, whatever went wrong, ms. */
const GIVE_UP = 1500;

interface Flight {
	kind: NavDirection;
	stage: HTMLElement;
	ghost: HTMLElement;
	/** Where the ghost of the flight before this one was drawn, when this one turns it around. */
	from?: { x: number; y: number };
	animations: Animation[];
	timer: ReturnType<typeof setTimeout>;
}

let flight: Flight | null = null;
/** No stage before the page changed (the first run, a page outside the shell): the root fades. */
let rootFade = false;

const INVERSE: Partial<Record<NavDirection, NavDirection>> = { push: 'pop', pop: 'push', cover: 'uncover', uncover: 'cover' };

function drawn(node: Element): { x: number; y: number; opacity: string } {
	const cs = getComputedStyle(node);
	const m = cs.transform && cs.transform !== 'none' ? new DOMMatrixReadOnly(cs.transform) : null;
	return { x: m?.m41 ?? 0, y: m?.m42 ?? 0, opacity: cs.opacity };
}

function end(f: Flight | null = flight) {
	if (!f) return;
	clearTimeout(f.timer);
	for (const a of f.animations) a.cancel();
	f.ghost.remove();
	f.stage.style.removeProperty('background');
	if (flight === f) {
		flight = null;
		delete document.documentElement.dataset.nav;
	}
}

/** Copies every scroll offset from a tree to its clone, so the picture shows what was on screen. */
function copyScroll(from: Element, to: Element) {
	const a = document.createTreeWalker(from, NodeFilter.SHOW_ELEMENT);
	const b = document.createTreeWalker(to, NodeFilter.SHOW_ELEMENT);
	let x: Node | null = a.currentNode;
	let y: Node | null = b.currentNode;
	while (x && y) {
		const el = x as Element;
		if (el.scrollTop || el.scrollLeft) (y as Element).scrollTo(el.scrollLeft, el.scrollTop);
		x = a.nextNode();
		y = b.nextNode();
	}
}

/**
 * Before the page changes: keeps the picture of the one that is going. `kind` is the move
 * (`pageMotion` in ios/direction.ts). Never waits, never throws.
 */
export function leave(kind: NavDirection): void {
	rootFade = false;
	const stage = document.querySelector<HTMLElement>(STAGE);
	if (kind === 'none' || !stage || typeof stage.animate !== 'function') {
		end();
		rootFade = kind !== 'none' && !stage;
		return;
	}
	try {
		const was = flight;
		// Where the page is drawn now: mid-flight, that is where its picture starts from.
		const at = drawn(stage);
		const turned = was && INVERSE[was.kind] === kind ? drawn(was.ghost) : undefined;
		const ghost = stage.cloneNode(true) as HTMLElement;
		end(was);
		ghost.removeAttribute('data-page-stage');
		ghost.setAttribute('data-page-ghost', '');
		ghost.setAttribute('aria-hidden', 'true');
		ghost.inert = true;
		ghost.classList.add('page-ghost');
		// Over the stage when it is the one that leaves on top, under it otherwise.
		ghost.style.cssText = `position:absolute;inset:0;height:auto;z-index:${kind === 'pop' || kind === 'uncover' ? 2 : 0}`;
		if (at.x || at.y) ghost.style.transform = `translate(${at.x}px, ${at.y}px)`;
		stage.after(ghost);
		copyScroll(stage, ghost);
		const f: Flight = { kind, stage, ghost, from: turned, animations: [], timer: setTimeout(() => end(f), GIVE_UP) };
		flight = f;
		// What is in flight, for styles and tests: gone when the move is.
		document.documentElement.dataset.nav = kind;
	} catch {
		end();
	}
}

/** Once the new page is there: moves it and the picture of the old one. */
export function arrive(): void {
	if (rootFade) {
		rootFade = false;
		const root = document.querySelector<HTMLElement>('[data-root-stage]');
		root?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: DURATIONS.fade, easing: EASINGS.out });
		return;
	}
	const f = flight;
	if (!f || f.animations.length) return;
	const stage = document.querySelector<HTMLElement>(STAGE);
	// The stage itself was replaced (the shell came or went): nothing to move against.
	if (stage !== f.stage || !f.ghost.isConnected) return end(f);
	try {
		const { ghost, kind } = f;
		const w = stage.offsetWidth;
		const h = stage.offsetHeight;
		const g = drawn(ghost);
		const spring = springCss('page');
		const timing: KeyframeAnimationOptions = { duration: spring.duration, easing: spring.easing, fill: 'both' };
		const x = (px: number) => `translate3d(${px}px, 0, 0)`;
		const y = (px: number) => `translate3d(0, ${px}px, 0)`;
		const run = (node: Element, frames: Keyframe[], options: KeyframeAnimationOptions = timing) => {
			try {
				f.animations.push(node.animate(frames, options));
			} catch {
				f.animations.push(node.animate(frames, { ...options, easing: EASINGS.ios }));
			}
		};
		// The page under gets darker: a black veil over it, its opacity alone changes.
		const veil = (over: HTMLElement, from: number, to: number) => {
			const v = document.createElement('div');
			v.className = 'page-veil';
			v.style.cssText = 'position:absolute;inset:0;z-index:100;background:#000;pointer-events:none;opacity:0';
			over.appendChild(v);
			run(v, [{ opacity: from }, { opacity: to }]);
			return v;
		};
		// A part both pages have in the same place (`data-page-pin`: the Slates list beside the
		// slate) stays still while the rest moves: it moves back by as much as its page.
		const pin = (page: HTMLElement, from: number, to: number) => {
			const node = page.querySelector<HTMLElement>(PIN);
			if (node) run(node, [{ transform: x(-from) }, { transform: x(-to) }]);
		};
		const pinned = !!stage.querySelector(PIN) && !!ghost.querySelector(PIN);
		// The new page's ground where its pinned part was would hide the old page under it.
		if (pinned && (kind === 'push' || kind === 'pop')) stage.style.background = ghost.style.background = 'transparent';
		let cleanup: (() => void) | undefined;
		if (kind === 'push') {
			run(stage, [{ transform: x(f.from ? f.from.x : w) }, { transform: x(0) }]);
			run(ghost, [{ transform: x(g.x) }, { transform: x(-w * PARALLAX) }]);
			veil(ghost, 0, DIM);
			if (pinned) {
				pin(stage, f.from ? f.from.x : w, 0);
				pin(ghost, g.x, -w * PARALLAX);
			}
		} else if (kind === 'pop') {
			run(stage, [{ transform: x(f.from ? f.from.x : -w * PARALLAX) }, { transform: x(0) }]);
			run(ghost, [{ transform: x(g.x) }, { transform: x(w) }]);
			if (pinned) {
				pin(stage, f.from ? f.from.x : -w * PARALLAX, 0);
				pin(ghost, g.x, w);
			}
			const v = veil(stage, DIM, 0);
			cleanup = () => v.remove();
		} else if (kind === 'cover') {
			run(stage, [{ transform: y(f.from ? f.from.y : h) }, { transform: y(0) }]);
		} else if (kind === 'uncover') {
			run(ghost, [{ transform: y(g.y) }, { transform: y(h) }]);
		} else {
			// A fade: the new page comes in over the old one, which stays whole under it.
			run(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: DURATIONS.fade, easing: EASINGS.out, fill: 'both' });
		}
		const done = () => {
			cleanup?.();
			if (flight === f) end(f);
			else f.ghost.remove();
		};
		// A cancelled animation (a new navigation took over) cleans up there, not here.
		Promise.all(f.animations.map((a) => a.finished)).then(done, () => cleanup?.());
	} catch {
		end(f);
	}
}
