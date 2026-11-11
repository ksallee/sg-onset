// Recent values of a number field, newest first, no repeats. Pure.

export const RECENT_CAP = 5;

export function pushRecent(list: readonly number[], value: number, cap = RECENT_CAP): number[] {
	return [value, ...list.filter((v) => v !== value)].slice(0, cap);
}
