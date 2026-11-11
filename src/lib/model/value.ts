// Whether two stored field values are the same value. Pure.

/** The key a length keeps its typed text under. It is how the value was written, not the value. */
const ENTERED = 'entered';

/** A stored timestamp: UTC, seconds, optional fraction (validate.ts holds the same rule). */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * No value. `false` counts: only a boolean field holds it, and FPT keeps an unticked checkbox as
 * no value (lib/fpt README, "Where FPT did not fit"). So a stored `false` never reads as a
 * conflict against an unticked box.
 */
const absent = (v: unknown): boolean => v == null || v === false;

/**
 * True when `a` and `b` hold the same value. Objects and lists compare by content. A missing
 * value equals a missing value, and `false` is a missing value. Two lengths are the same when
 * their metres are, whatever text was typed: 6' and 6 ft are one value. Two timestamps are the
 * same when they name the same moment: FPT answers `09:01:02Z` for `09:01:02.000Z`.
 */
export function sameValue(a: unknown, b: unknown): boolean {
	if (absent(a) || absent(b)) return absent(a) && absent(b);
	if (typeof a === 'string' && typeof b === 'string' && a !== b && TIMESTAMP.test(a) && TIMESTAMP.test(b)) return Date.parse(a) === Date.parse(b);
	if (typeof a !== 'object' || typeof b !== 'object') return a === b;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((item, i) => sameValue(item, b[i]));
	}
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
	keys.delete(ENTERED);
	for (const key of keys) if (!sameValue(left[key], right[key])) return false;
	return true;
}
