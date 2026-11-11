// The number keypad's input, pure: what a key does to the text being typed, what number the text
// is, what the stepper does, how a held key repeats, what a hardware key means. The system
// keyboard is never shown, and there is no text field: nothing can be pasted.

export interface NumberSpec {
	min: number;
	max: number;
	/** Decimal places kept. 0: whole numbers, the point key does nothing. */
	decimals: number;
	/** What the stepper moves by. */
	step: number;
	/** The values the stepper stops on instead of the `step` grid, rising: a lens's stops. Typing is free. */
	stops?: readonly number[];
}

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type Key = Digit | '.' | 'back' | 'sign' | 'clear';

/** The text in the keypad. `fresh`: it still shows the field's value; the first digit replaces it. */
export interface Entry {
	text: string;
	fresh: boolean;
}

/** At most `decimals` places, trailing zeros trimmed. */
export function formatNumber(value: number, decimals: number): string {
	return String(Number(value.toFixed(decimals)));
}

export function startEntry(value: number | null, decimals = 6): Entry {
	return { text: value === null ? '' : formatNumber(value, decimals), fresh: true };
}

const wholeDigits = (spec: NumberSpec) => String(Math.floor(Math.max(Math.abs(spec.min), Math.abs(spec.max)))).length;

/** The longest text the keys can make: the whole digits, the point and its places, a minus. The display is sized for it. */
export function maxChars(spec: NumberSpec): number {
	return wholeDigits(spec) + (spec.decimals > 0 ? 1 + spec.decimals : 0) + (spec.min < 0 ? 1 : 0);
}

function digit(text: string, d: Digit, spec: NumberSpec): string {
	const neg = text.startsWith('-') ? '-' : '';
	const body = neg ? text.slice(1) : text;
	const [whole, frac] = body.split('.');
	if (frac !== undefined) return frac.length >= spec.decimals ? text : text + d;
	if (whole === '0') return neg + d;
	return whole.length >= wholeDigits(spec) ? text : text + d;
}

export function keypadPress(entry: Entry, key: Key, spec: NumberSpec): Entry {
	const { text, fresh } = entry;
	const typed = (t: string): Entry => ({ text: t, fresh: false });
	switch (key) {
		case 'clear':
			return typed('');
		case 'back':
			return typed(text.slice(0, -1));
		case 'sign':
			if (spec.min >= 0) return entry;
			return typed(text.startsWith('-') ? text.slice(1) : `-${text}`);
		case '.': {
			if (spec.decimals === 0) return fresh ? entry : typed(text);
			const base = fresh ? '' : text;
			if (base.includes('.')) return typed(base);
			return typed(base === '' || base === '-' ? `${base}0.` : `${base}.`);
		}
		default:
			return typed(digit(fresh ? '' : text, key, spec));
	}
}

const clamp = (v: number, spec: NumberSpec) => Math.min(spec.max, Math.max(spec.min, v));
/** To the field's places. Adding zero turns a negative zero into zero. */
const round = (v: number, spec: NumberSpec) => Number(v.toFixed(spec.decimals)) + 0;

/** The number typed, kept in range, or null for nothing typed. Clamped here, not while typing. */
export function entryValue(entry: Entry, spec: NumberSpec): number | null {
	const n = Number.parseFloat(entry.text);
	return Number.isNaN(n) ? null : round(clamp(n, spec), spec);
}

const EPS = 1e-9;

/** The next stop past `from` in the range, or the end of the range when there is none. */
function stepStop(from: number, dir: 1 | -1, stops: readonly number[], spec: NumberSpec): number {
	let to = dir > 0 ? spec.max : spec.min;
	for (const s of stops) {
		if (s < spec.min - EPS || s > spec.max + EPS) continue;
		if (dir > 0 && s > from + EPS) return s;
		if (dir < 0 && s < from - EPS) to = s;
	}
	return to;
}

/**
 * One step up (`dir` 1) or down (-1), in range: to the step grid, or to the next of the spec's
 * `stops`. Empty starts next to zero, or next to the end of the range nearest zero.
 */
export function stepValue(value: number | null, dir: 1 | -1, spec: NumberSpec): number {
	const from = value ?? clamp(0, spec);
	if (spec.stops) return round(clamp(stepStop(from, dir, spec.stops, spec), spec), spec);
	const steps = from / spec.step;
	const to = (dir > 0 ? Math.floor(steps + EPS) + 1 : Math.ceil(steps - EPS) - 1) * spec.step;
	return round(clamp(to, spec), spec);
}

/** Whether a step that way changes the value: false at the end of the range. The stepper key dims, a held one stops. */
export function canStep(value: number | null, dir: 1 | -1, spec: NumberSpec): boolean {
	return stepValue(value, dir, spec) !== value;
}

/** Third stops, T0.7 to T64, as lenses and cameras mark them. Every third one is a full stop. */
export const THIRD_STOPS: readonly number[] = [
	0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32, 36, 40,
	45, 51, 57, 64
];

export const REPEAT_WAIT_MS = 400;
export const REPEAT_SLOW_MS = 120;
export const REPEAT_FAST_MS = 40;

/**
 * Hold to repeat: the wait in ms before repeat number `done` + 1. The first comes after a hold,
 * four go slowly so one more step is easy to hit, then it speeds up to a floor.
 */
export function repeatDelay(done: number): number {
	if (done <= 0) return REPEAT_WAIT_MS;
	return Math.max(REPEAT_FAST_MS, REPEAT_SLOW_MS - Math.max(0, done - 4) * 5);
}

export type HardwareKey = Key | 'next' | 'done' | 'less' | 'more';

const NAMED: Record<string, HardwareKey> = {
	'.': '.',
	',': '.',
	'-': 'sign',
	Backspace: 'back',
	Delete: 'clear',
	Enter: 'next',
	Escape: 'done',
	ArrowUp: 'more',
	ArrowDown: 'less'
};

/** What a key of a hardware keyboard does, or null: not ours. A shortcut (Cmd, Ctrl, Alt) is never ours. */
export function hardwareKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): HardwareKey | null {
	if (e.ctrlKey || e.metaKey || e.altKey) return null;
	if (e.key.length === 1 && e.key >= '0' && e.key <= '9') return e.key as Digit;
	return Object.hasOwn(NAMED, e.key) ? NAMED[e.key] : null;
}
