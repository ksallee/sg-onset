// Record: the state of a take from its two stamps, and what a press does. It records no video.
// Pure: the clock comes in as `now` (epoch ms).
import type { Timing } from './types';

export type Phase = 'idle' | 'rolling' | 'filed';

export function phaseOf(t: Timing): Phase {
	if (t.start === null) return 'idle';
	return t.end === null ? 'rolling' : 'filed';
}

/** A press: idle stamps the start, rolling stamps the end (never before the start), filed stays. */
export function pressRecord<T extends Timing>(t: T, now: number): T {
	const phase = phaseOf(t);
	if (phase === 'idle') return { ...t, start: now, end: null };
	if (phase === 'rolling') return { ...t, end: Math.max(now, t.start as number) };
	return t;
}

/** One press back: a filed take rolls again from its own start, a rolling take is idle again. */
export function undoRecord<T extends Timing>(t: T): T {
	const phase = phaseOf(t);
	if (phase === 'filed') return { ...t, end: null };
	if (phase === 'rolling') return { ...t, start: null, end: null };
	return t;
}

/** How long the take ran, or has run so far. */
export function elapsedMs(t: Timing, now: number): number {
	if (t.start === null) return 0;
	return Math.max(0, (t.end ?? now) - t.start);
}

const two = (n: number) => String(n).padStart(2, '0');

/** `m:ss`, or `h:mm:ss` past an hour. Whole seconds, rounded down. */
export function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** The wall time `HH:MM:SS` of an epoch ms, `offsetMin` minutes east of UTC. */
export function formatClock(ms: number, offsetMin: number): string {
	const d = new Date(ms + offsetMin * 60_000);
	return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}
