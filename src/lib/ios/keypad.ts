// The number keypad's input, pure: what a key does to the text being typed, what number the text
// is, what the stepper does. The system keyboard is never shown.

export interface NumberSpec {
	min: number;
	max: number;
	/** Decimal places kept. 0: whole numbers, the point key does nothing. */
	decimals: number;
	/** What the stepper moves by. */
	step: number;
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
const round = (v: number, spec: NumberSpec) => Number(v.toFixed(spec.decimals));

/** The number typed, kept in range, or null for nothing typed. Clamped here, not while typing. */
export function entryValue(entry: Entry, spec: NumberSpec): number | null {
	const n = Number.parseFloat(entry.text);
	return Number.isNaN(n) ? null : round(clamp(n, spec), spec);
}

/** One step up (`dir` 1) or down (-1), to the step grid, in range. Empty starts next to zero. */
export function stepValue(value: number | null, dir: 1 | -1, spec: NumberSpec): number {
	const from = value ?? clamp(0, spec);
	const steps = from / spec.step;
	const eps = 1e-9;
	const to = (dir > 0 ? Math.floor(steps + eps) + 1 : Math.ceil(steps - eps) - 1) * spec.step;
	return round(clamp(to, spec), spec);
}
