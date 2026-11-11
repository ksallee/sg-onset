// A damped spring, pure. Two numbers describe it, as Apple's do: `response` (seconds: how quick
// it is; lower is snappier) and `damping` (1: no overshoot; under 1: it bounces). A spring has no
// duration: it starts from where the thing is, at the speed it has, so a new target mid-flight
// or a finger letting go never makes it jump. `springStep` is exact for any time step: the same
// motion at 60 Hz and at 120 Hz.

export interface Spring {
	/** Seconds. The period of the spring without damping. */
	response: number;
	/** The damping ratio. 1: critically damped. */
	damping: number;
}

export interface SpringState {
	/** Where it is. */
	x: number;
	/** How fast it moves, units per second. */
	v: number;
}

/** The state `dt` seconds later, on its way to `target`. */
export function springStep(state: SpringState, target: number, dt: number, spring: Spring): SpringState {
	if (dt <= 0) return state;
	const w = (2 * Math.PI) / spring.response;
	const z = Math.min(1, Math.max(0.05, spring.damping));
	const x0 = state.x - target;
	const v0 = state.v;
	if (z >= 1) {
		const c = v0 + w * x0;
		const e = Math.exp(-w * dt);
		return { x: target + (x0 + c * dt) * e, v: (v0 - w * c * dt) * e };
	}
	const wd = w * Math.sqrt(1 - z * z);
	const e = Math.exp(-z * w * dt);
	const cos = Math.cos(wd * dt);
	const sin = Math.sin(wd * dt);
	return {
		x: target + e * (x0 * cos + ((v0 + z * w * x0) / wd) * sin),
		v: e * (v0 * cos - ((z * w * v0 + w * w * x0) / wd) * sin)
	};
}

/** Close enough to the target and slow enough to stop on it (px and px per second by default). */
export function springAtRest(state: SpringState, target: number, within = 0.5, speed = 10): boolean {
	return Math.abs(state.x - target) <= within && Math.abs(state.v) <= speed;
}

/** Seconds until a spring let go at rest stays within `threshold` of the way to its target. */
export function springSettle(spring: Spring, threshold = 0.005): number {
	const step = 0.001;
	let last = 0;
	let s: SpringState = { x: 1, v: 0 };
	for (let t = step; t < spring.response * 8; t += step) {
		s = springStep(s, 0, step, spring);
		if (Math.abs(s.x) > threshold) last = t;
	}
	return last + step;
}

/** How far along (0 to 1) a spring let go at rest is after `seconds`. */
export function springProgress(spring: Spring, seconds: number): number {
	return 1 - springStep({ x: 1, v: 0 }, 0, seconds, spring).x;
}

/**
 * The spring as a CSS `linear()` easing with the duration to give it, for motion a tap starts
 * (a transition or a Web Animation: off the main thread, retargeted from where it is). Motion a
 * finger drives uses `springStep` instead, so the finger's speed carries on.
 */
export function springLinear(spring: Spring, points = 24): { easing: string; duration: number } {
	const seconds = springSettle(spring);
	const stops: string[] = ['0'];
	for (let i = 1; i < points; i++) {
		stops.push(String(Math.round(springProgress(spring, (seconds * i) / points) * 1000) / 1000));
	}
	stops.push('1');
	return { easing: `linear(${stops.join(', ')})`, duration: Math.round((seconds * 1000) / 10) * 10 };
}
