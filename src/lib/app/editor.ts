// Every edit the UI makes goes through here: it is written to the store (and so queued for sync)
// and put on the undo stack. Undo is the inverse patch, applied and queued like any edit. The
// stack rules are pure (undo.ts); this runs them on a Store.
//
// A risky edit (deleting a project or a shoot day, a patch of 20 entries or more) waits for a
// snapshot first (`snapshotBefore`), so the snapshot holds the state before it. Awaited, not run
// alongside: the snapshot's read must open before the edit's write for IndexedDB to order them,
// and nothing promises that once both are in flight. Measured in Chromium with 2,000 takes, a
// 200-take apply went from 50 to 115 ms alone to 100 to 185 ms with its snapshot: under a fifth of a
// second. Only bulk edits and deletes pay it, never the take screen's small edits. A
// failed snapshot does not stop the edit: the done event carries `noSnapshot` for the notice.

import { change, type Patch } from '$lib/model/patch';
import type { RowOf, TableName } from '$lib/store/tables';
import { isRiskyEdit, type RiskyReason } from '$lib/store/snapshots';
import type { NewBlob, Store } from '$lib/store/types';
import { collectTree } from './tree';
import { EMPTY_UNDO, popRedo, popUndo, record, redoActions, undoActions, type Action, type Label, type Step, type UndoEntry, type UndoState } from './undo';

/** What just happened, for the notice: an edit done, undone or done again. `tooLate`: an undo the server made impossible. */
export type EditEvent = { kind: 'done' | 'undone' | 'redone' | 'tooLate'; label?: Label; noSnapshot?: true };

export interface Editor {
	/** The undo stack. */
	readonly state: UndoState;
	/** Applies a model patch. Returns it as applied. */
	apply(table: TableName, patch: Patch, label?: Label): Promise<Patch>;
	/** Sets one field of one record: `apply` with a patch of one change. `undefined` clears it. */
	set(table: TableName, record: { id: string }, key: string, value: unknown, label?: Label): Promise<Patch>;
	create<T extends TableName>(table: T, row: RowOf<T>, options?: { attach?: NewBlob; label?: Label }): Promise<void>;
	/** Moves one record to the trash. What is under it stays: see `removeTree`. */
	remove(table: TableName, id: string, label?: Label): Promise<void>;
	/** Removes a record and everything under it, as one entry. */
	removeTree(table: TableName, id: string, label?: Label): Promise<void>;
	/** Everything `fn` does through this editor becomes one undo entry. */
	group<R>(label: Label | undefined, fn: () => Promise<R>): Promise<R>;
	undo(): Promise<EditEvent | undefined>;
	redo(): Promise<EditEvent | undefined>;
}

type EditStore = Pick<Store, 'apply' | 'create' | 'remove' | 'restore' | 'list'>;

export type EditorOptions = {
	/** Takes a snapshot before a risky edit. False, or a throw: none was taken. */
	snapshotBefore?(reason: RiskyReason): Promise<boolean>;
};

/** The snapshot a delete of `table`'s tree needs first, if any. */
const DELETE_REASON: Partial<Record<TableName, RiskyReason>> = { project: 'deleteProject', shootDay: 'deleteShootDay' };

/** `onchange` is told of every change of the stack and what caused it. */
export function createEditor(store: EditStore, onchange: (state: UndoState, event: EditEvent) => void = () => {}, options: EditorOptions = {}): Editor {
	let state = EMPTY_UNDO;
	let open: Step[] | null = null;
	/** A snapshot before the edit under way failed: its done event says so. */
	let unguarded = false;

	async function guard(reason: RiskyReason): Promise<void> {
		if (!options.snapshotBefore) return;
		let taken = false;
		try {
			taken = await options.snapshotBefore(reason);
		} catch {
			taken = false;
		}
		if (!taken) unguarded = true;
	}

	function done(entry: UndoEntry): void {
		const next = record(state, entry);
		const noSnapshot = unguarded;
		unguarded = false;
		if (next === state) return;
		state = next;
		onchange(state, { kind: 'done', ...(entry.label ? { label: entry.label } : {}), ...(noSnapshot ? { noSnapshot: true as const } : {}) });
	}
	function step(s: Step, label: Label | undefined): void {
		if (open) open.push(s);
		else done({ ...(label ? { label } : {}), steps: [s] });
	}
	/** Runs the actions. False when a restore came too late: the delete had been sent. */
	async function run(actions: Action[]): Promise<boolean> {
		let ok = true;
		for (const a of actions) {
			if (a.do === 'apply') await store.apply(a.table, a.patch);
			else if (a.do === 'remove') await store.remove(a.table, a.id);
			else ok = (await store.restore(a.table, a.id)) && ok;
		}
		return ok;
	}
	async function travel(pop: typeof popUndo, actions: (entry: UndoEntry) => Action[], kind: 'undone' | 'redone'): Promise<EditEvent | undefined> {
		const popped = pop(state);
		if (!popped) return undefined;
		const ok = await run(actions(popped.entry));
		// What could not be put back cannot be redone either: the entry is dropped.
		state = ok ? popped.state : { past: state.past.filter((e) => e !== popped.entry), future: state.future.filter((e) => e !== popped.entry) };
		const event: EditEvent = { kind: ok ? kind : 'tooLate', ...(popped.entry.label ? { label: popped.entry.label } : {}) };
		onchange(state, event);
		return event;
	}

	const editor: Editor = {
		get state() {
			return state;
		},
		async apply(table, patch, label) {
			if (isRiskyEdit(new Set(patch.map((c) => c.id)).size)) await guard('bulkEdit');
			const applied = await store.apply(table, patch);
			// A change that left the stored value as it was is nothing to undo. Compared as stored, so
			// a length retyped another way (6' as 6 ft) still counts: undo brings the old text back.
			const moved = applied.filter((c) => JSON.stringify(c.from) !== JSON.stringify(c.to));
			step({ kind: 'patch', table, patch: moved }, label);
			return applied;
		},
		set(table, row, key, value, label) {
			return editor.apply(table, [change(row, key, value)], label);
		},
		async create(table, row, options = {}) {
			await store.create(table, row, options.attach);
			step({ kind: 'create', table, id: row.id }, options.label);
		},
		async remove(table, id, label) {
			await store.remove(table, id);
			step({ kind: 'remove', table, id }, label);
		},
		async removeTree(table, id, label) {
			const reason = DELETE_REASON[table];
			if (reason) await guard(reason);
			return editor.group(label, async () => {
				for (const node of await collectTree((t, parent) => store.list(t, parent), table, id)) await editor.remove(node.table, node.id);
			});
		},
		async group(label, fn) {
			// A group inside a group joins it.
			if (open) return fn();
			const steps: Step[] = (open = []);
			try {
				return await fn();
			} finally {
				open = null;
				// A group that failed half way keeps what it did, so it can be undone.
				done({ ...(label ? { label } : {}), steps });
			}
		},
		undo: () => travel(popUndo, undoActions, 'undone'),
		redo: () => travel(popRedo, redoActions, 'redone')
	};
	return editor;
}
