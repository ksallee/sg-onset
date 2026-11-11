// The motion tokens for code: the same values as motion.css (motion.test.ts keeps the two in
// step). CSS uses the custom properties; a Web Animation or a spring a finger drives reads these.
// What each is for: docs/design/motion.md.
import { springLinear, type Spring } from '$lib/ios/spring';

/** The springs. None bounces: content does not overshoot. */
export const SPRINGS = {
	/** A control answering a tap: a switch, a segmented thumb, the selected item. */
	snappy: { response: 0.25, damping: 1 },
	/** A surface moving a short way: the sidebar, a menu, a notice, a list closing a gap. */
	smooth: { response: 0.35, damping: 1 },
	/** A page pushing or popping, an action sheet coming up. */
	page: { response: 0.4, damping: 1 },
	/** A sheet under a finger: present, snap to a detent, dismiss. Carries the finger's speed. */
	sheet: { response: 0.4, damping: 1 }
} as const satisfies Record<string, Spring>;

export type SpringName = keyof typeof SPRINGS;

/** The springs CSS has as `--spring-<name>` with `--dur-<name>`. */
export const CSS_SPRINGS = ['snappy', 'smooth', 'page'] as const satisfies readonly SpringName[];

/** Curves for what is not a spring: `--ease-<name>`. */
export const EASINGS = {
	/** Entering, leaving, a fade. */
	out: 'cubic-bezier(0.23, 1, 0.32, 1)',
	/** The kit's first curve, kept for the parts that still read it. */
	ios: 'cubic-bezier(0.32, 0.72, 0, 1)'
} as const;

/** Milliseconds: `--dur-<name>`. */
export const DURATIONS = {
	/** A press letting go. The press itself lands at once. */
	press: 200,
	/** A fade: one page over another, a label, every move under reduced motion. */
	fade: 150,
	/** Something leaving. Shorter than it took to come. */
	exit: 200
} as const;

const cache = new Map<SpringName, { easing: string; duration: number }>();

/** A spring as a `linear()` easing and its duration, for `element.animate`. */
export function springCss(name: SpringName): { easing: string; duration: number } {
	let css = cache.get(name);
	if (!css) cache.set(name, (css = springLinear(SPRINGS[name])));
	return css;
}
