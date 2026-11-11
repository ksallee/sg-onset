// The pure part of the live reads (live.svelte.ts). The store says which tables a commit
// touched; a read says which tables it depends on.

/** Whether a store event that touched `changed` concerns a read of `watched`. No tables watched: every change does. */
export function touches(changed: readonly string[], watched: readonly string[]): boolean {
	return watched.length === 0 || changed.some((table) => watched.includes(table));
}

/**
 * Tells answers that came back out of order apart: `begin()` numbers a read, `current(n)` says
 * whether it is still the newest one started. A slow old read must not overwrite a newer answer.
 */
export function latest(): { begin(): number; current(n: number): boolean } {
	let last = 0;
	return { begin: () => ++last, current: (n) => n === last };
}
