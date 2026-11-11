// Rational numbers, as OpenTrackIO stores frame rates and squeeze: { num, denom }, both positive
// integers, always in lowest terms. Pure.

export type Rational = { num: number; denom: number };

/** Frame rates that have a 1000/1001 form. "23.976" and "23.98" both mean 24000/1001. */
const NTSC_BASES = [24, 30, 48, 60, 96, 120, 240];

/** How far a typed decimal may sit from base × 1000/1001 and still mean it. */
const NTSC_TOLERANCE = 0.006;

function gcd(a: number, b: number): number {
	while (b) [a, b] = [b, a % b];
	return a;
}

/** `num/denom` in lowest terms. */
export function rational(num: number, denom: number): Rational {
	const g = gcd(num, denom) || 1;
	return { num: num / g, denom: denom / g };
}

/**
 * Reads "24", "24000/1001", "22.5" or "1,8". A decimal becomes the exact fraction it spells.
 * Null when the text is none of these, or the value is not above zero.
 */
export function parseRational(text: string): Rational | null {
	const t = text.trim().replace(',', '.');
	const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
	if (fraction) {
		const num = Number(fraction[1]);
		const denom = Number(fraction[2]);
		return num > 0 && denom > 0 ? rational(num, denom) : null;
	}
	const decimal = /^(\d+)(?:\.(\d+))?$/.exec(t);
	if (!decimal) return null;
	const places = decimal[2]?.length ?? 0;
	const num = Number(decimal[1] + (decimal[2] ?? ''));
	return num > 0 ? rational(num, 10 ** places) : null;
}

/**
 * Reads a frame rate. A decimal within reach of an NTSC rate becomes that rate's 1001 rational;
 * every other value stays exact. A trailing "fps" or "Hz" is allowed.
 */
export function parseFrameRate(text: string): Rational | null {
	const r = parseRational(text.trim().replace(/\s*(fps|hz)$/i, ''));
	if (!r || r.denom === 1 || r.denom === 1001) return r;
	const value = r.num / r.denom;
	for (const base of NTSC_BASES) {
		if (Math.abs(value - (base * 1000) / 1001) <= NTSC_TOLERANCE) return rational(base * 1000, 1001);
	}
	return r;
}

/** "24", "23.976", "1.3": whole numbers bare, the rest to three places with no trailing zeros. */
export function formatRational(r: Rational): string {
	if (r.denom === 1) return String(r.num);
	return String(Number((r.num / r.denom).toFixed(3)));
}

export function rationalToNumber(r: Rational): number {
	return r.num / r.denom;
}
