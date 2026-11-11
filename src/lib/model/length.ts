// Lengths. Stored in metres, as OpenTrackIO does; feet and inches are a way to type and show
// them. A length keeps the text the user typed and the system it was typed in, so it shows again
// exactly as typed. Pure.

export type UnitSystem = 'imperial' | 'metric';

export type Length = {
	/** Metres, rounded to the micrometre. 'inf' is a focus at infinity. */
	m: number | 'inf';
	/** What the user typed, trimmed, and the system it reads in. Absent on a computed value. */
	entered?: { text: string; system: UnitSystem };
};

const M_PER_INCH = 0.0254;
const NUM = String.raw`\d+(?:\.\d+)?`;
const FEET = String.raw`(?:'|′|ft|feet|foot)`;
const INCHES = String.raw`(?:"|″|''|in|inch|inches)`;
/** Inches: "3", "3.5", "3 1/2" or "1/2". */
const INCH_VALUE = String.raw`(?:(${NUM})(?:\s+(\d+)\s*\/\s*(\d+))?|(\d+)\s*\/\s*(\d+))`;

const INFINITY = /^(inf|infinity|∞)$/i;
const METRIC = new RegExp(String.raw`^(${NUM})\s*(m|cm|mm)$`, 'i');
const FEET_INCHES = new RegExp(String.raw`^(${NUM})\s*${FEET}\s*(?:${INCH_VALUE}\s*${INCHES}?)?$`, 'i');
const INCHES_ONLY = new RegExp(String.raw`^${INCH_VALUE}\s*${INCHES}$`, 'i');
const BARE = new RegExp(String.raw`^(${NUM})$`);
const METRIC_FACTOR: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001 };

const round = (m: number) => Math.round(m * 1e6) / 1e6 + 0;

/** A computed length, with no typed text. */
export function metres(m: number): Length {
	return { m: round(m) };
}

/** Inches from the groups INCH_VALUE captures, starting at `at`. */
function inches(match: RegExpExecArray, at: number): number {
	const [whole, num, denom, loneNum, loneDenom] = match.slice(at, at + 5);
	if (loneNum !== undefined) return Number(loneNum) / Number(loneDenom);
	if (whole === undefined) return 0;
	return Number(whole) + (num !== undefined ? Number(num) / Number(denom) : 0);
}

/**
 * Reads a length. With a unit it is that unit: 6', 6' 3", 6ft 3in, 6' 3 1/2", 75", 1.2m, 120 cm.
 * A bare number is feet in `system` imperial, metres in metric. "inf" or ∞ is infinity. A leading
 * minus is allowed. Null when the text is none of these.
 */
export function parseLength(text: string, system: UnitSystem): Length | null {
	const typed = text.trim();
	if (INFINITY.test(typed)) return { m: 'inf', entered: { text: typed, system } };
	const negative = typed.startsWith('-');
	const t = (negative ? typed.slice(1).trim() : typed).replace(/(\d),(\d)/g, '$1.$2');
	let m: number;
	let typedIn: UnitSystem;
	let match: RegExpExecArray | null;
	if ((match = METRIC.exec(t))) {
		m = Number(match[1]) * METRIC_FACTOR[match[2].toLowerCase()];
		typedIn = 'metric';
	} else if ((match = FEET_INCHES.exec(t))) {
		m = (Number(match[1]) * 12 + inches(match, 2)) * M_PER_INCH;
		typedIn = 'imperial';
	} else if ((match = INCHES_ONLY.exec(t))) {
		m = inches(match, 1) * M_PER_INCH;
		typedIn = 'imperial';
	} else if ((match = BARE.exec(t))) {
		m = system === 'imperial' ? Number(match[1]) * 12 * M_PER_INCH : Number(match[1]);
		typedIn = system;
	} else {
		return null;
	}
	if (!Number.isFinite(m)) return null;
	return { m: round(negative ? -m : m), entered: { text: typed, system: typedIn } };
}

/**
 * Shows a length in `system`. Typed text comes back as typed when it was typed in that system.
 * Otherwise: feet and inches to the nearest inch (6' 3"), or metres to the millimetre (1.905 m).
 */
export function formatLength(length: Length, system: UnitSystem): string {
	if (length.entered?.system === system) return length.entered.text;
	if (length.m === 'inf') return '∞';
	if (system === 'metric') return `${Number(length.m.toFixed(3))} m`;
	const total = Math.round(Math.abs(length.m) / M_PER_INCH);
	const sign = length.m < 0 && total > 0 ? '-' : '';
	const feet = Math.floor(total / 12);
	const rest = total % 12;
	if (feet === 0) return `${sign}${rest}"`;
	return rest === 0 ? `${sign}${feet}'` : `${sign}${feet}' ${rest}"`;
}
