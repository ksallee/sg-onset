// Undo, not confirm: every change keeps the state before it, with a label for the undo line. Pure.

export interface History<T> {
	/** Oldest first. */
	past: { state: T; label: string }[];
}

export const HISTORY_CAP = 50;

export const emptyHistory = <T>(): History<T> => ({ past: [] });

/** Keeps `state` (the state before a change) under `label` (what the change was). */
export function commit<T>(h: History<T>, state: T, label: string, cap = HISTORY_CAP): History<T> {
	return { past: [...h.past, { state, label }].slice(-cap) };
}

/** The state to go back to and what is undone, or null when there is nothing. */
export function undo<T>(h: History<T>): { history: History<T>; state: T; label: string } | null {
	const last = h.past[h.past.length - 1];
	if (!last) return null;
	return { history: { past: h.past.slice(0, -1) }, state: last.state, label: last.label };
}
