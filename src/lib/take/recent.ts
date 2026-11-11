// Recent values of a number field, newest first, no repeats. Pure.

export const RECENT_CAP = 5;

/** `value` to the front. Not a number: the list as it was. A negative zero is kept as zero. */
export function pushRecent(list: readonly number[], value: number, cap = RECENT_CAP): number[] {
	if (!Number.isFinite(value)) return list.slice(0, cap);
	return [value + 0, ...list.filter((v) => v !== value)].slice(0, cap);
}
