// The undo stack, as data. An entry is one thing the person did: one or more steps on the store.
// Undo runs the steps backwards, each inverted; redo runs them forwards again. Pure: the editor
// (editor.ts) runs the actions on the store.

import { invertPatch, type Patch } from '$lib/model/patch';
import type { TableName } from '$lib/store/tables';

export type Step =
	/** Fields changed. `patch` is the patch as the store applied it. */
	| { kind: 'patch'; table: TableName; patch: Patch }
	| { kind: 'create'; table: TableName; id: string }
	| { kind: 'remove'; table: TableName; id: string };

/** What an entry is called: a message key and its parameters, never English. */
export type Label = { key: string; params?: Record<string, string | number> };

export type UndoEntry = { label?: Label; steps: readonly Step[] };

export type UndoState = { past: readonly UndoEntry[]; future: readonly UndoEntry[] };

export const EMPTY_UNDO: UndoState = { past: [], future: [] };
export const UNDO_LIMIT = 100;

/** What the editor asks of the store for one step. */
export type Action =
	| { do: 'apply'; table: TableName; patch: Patch }
	| { do: 'remove'; table: TableName; id: string }
	| { do: 'restore'; table: TableName; id: string };

const idle = (step: Step) => step.kind === 'patch' && step.patch.length === 0;

/** The stack with `entry` done. Anything undone before is no longer redoable. An entry that changed nothing is not kept. */
export function record(state: UndoState, entry: UndoEntry, limit = UNDO_LIMIT): UndoState {
	const steps = entry.steps.filter((s) => !idle(s));
	if (steps.length === 0) return state;
	return { past: [...state.past, { ...entry, steps }].slice(-limit), future: [] };
}

/** The last entry done, moved to the redo side. */
export function popUndo(state: UndoState): { entry: UndoEntry; state: UndoState } | undefined {
	const entry = state.past[state.past.length - 1];
	if (!entry) return undefined;
	return { entry, state: { past: state.past.slice(0, -1), future: [...state.future, entry] } };
}

/** The last entry undone, moved back to the done side. */
export function popRedo(state: UndoState): { entry: UndoEntry; state: UndoState } | undefined {
	const entry = state.future[state.future.length - 1];
	if (!entry) return undefined;
	return { entry, state: { past: [...state.past, entry], future: state.future.slice(0, -1) } };
}

/** What undoes `entry`: its steps last first, a patch inverted, a create removed, a remove restored. */
export function undoActions(entry: UndoEntry): Action[] {
	return [...entry.steps].reverse().map((step): Action => {
		if (step.kind === 'patch') return { do: 'apply', table: step.table, patch: invertPatch(step.patch) };
		if (step.kind === 'create') return { do: 'remove', table: step.table, id: step.id };
		return { do: 'restore', table: step.table, id: step.id };
	});
}

/** What does `entry` again after an undo: its steps in order. A create undone is in the trash, so it is restored. */
export function redoActions(entry: UndoEntry): Action[] {
	return entry.steps.map((step): Action => {
		if (step.kind === 'patch') return { do: 'apply', table: step.table, patch: step.patch };
		if (step.kind === 'create') return { do: 'restore', table: step.table, id: step.id };
		return { do: 'remove', table: step.table, id: step.id };
	});
}
