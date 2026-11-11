// Whether two stored field values are the same value. Pure.

/** The key a length keeps its typed text under. It is how the value was written, not the value. */
const ENTERED = 'entered';

/**
 * True when `a` and `b` hold the same value. Objects and lists compare by content. A missing
 * value equals a missing value. Two lengths are the same when their metres are, whatever text was
 * typed: 6' and 6 ft are one value.
 */
export function sameValue(a: unknown, b: unknown): boolean {
	if (a == null || b == null) return a == null && b == null;
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
