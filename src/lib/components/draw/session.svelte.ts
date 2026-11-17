// A drawing open for editing: its shapes as the canvas shows them, each change saved through
// `app.edit` (one undo entry each), and Undo and Redo limited to what was done here. The shapes
// on screen are the truth while changes are being written; between writes they follow the store,
// so an undo shows. Make it while the component initialises.

import { untrack } from 'svelte';
import type { App } from '$lib/app/app.svelte';
import type { Label, UndoEntry } from '$lib/app/undo';
import type { Shape } from '$lib/draw/drawing';
import type { RowOf } from '$lib/store/tables';

export type DrawTable = 'markup';
type Row = RowOf<DrawTable>;

export class DrawSession {
	readonly #app: App;
	readonly #table: DrawTable;
	readonly #make: (id: string, shapes: Shape[]) => Row;
	/** The shapes on screen. */
	shapes = $state.raw<Shape[]>([]);
	#rowId: string | undefined;
	/** Writes under way. */
	#busy = 0;
	#chain: Promise<void> = Promise.resolve();
	/** The undo entries made here: only those are undone from here. */
	readonly #mine = new Set<UndoEntry>();
	#tick = $state(0);

	constructor(app: App, table: DrawTable, row: () => Row | undefined, make: (id: string, shapes: Shape[]) => Row) {
		this.#app = app;
		this.#table = table;
		this.#make = make;
		// The store's drawing, taken up whenever no write of ours is under way.
		$effect(() => {
			const r = row();
			untrack(() => {
				if (this.#busy) return;
				this.shapes = r?.shapes ?? [];
				this.#rowId = r?.id;
			});
		});
	}

	/** Saves the shapes as they now are. The screen shows them at once; the write follows. */
	commit(next: Shape[], label: Label): void {
		// Plain data only: IndexedDB cannot keep a rune's proxy.
		const shapes = $state.snapshot(next) as Shape[];
		this.shapes = shapes;
		this.#busy += 1;
		this.#chain = this.#chain
			.then(async () => {
				const edit = this.#app.edit;
				const before = edit.state.past.at(-1);
				if (this.#rowId) await edit.set(this.#table, { id: this.#rowId }, 'shapes', shapes, label);
				else {
					const made = this.#make(this.#app.newId(), shapes);
					this.#rowId = made.id;
					await edit.create(this.#table, made, { label });
				}
				const after = edit.state.past.at(-1);
				if (after && after !== before) this.#mine.add(after);
			})
			.catch((error) => console.warn('A drawing change was not saved:', error))
			.finally(() => {
				this.#busy -= 1;
				this.#tick += 1;
			});
	}

	get canUndo(): boolean {
		void this.#tick;
		void this.#app.lastEdit;
		const last = this.#app.edit.state.past.at(-1);
		return !!last && this.#mine.has(last);
	}

	get canRedo(): boolean {
		void this.#tick;
		void this.#app.lastEdit;
		const next = this.#app.edit.state.future.at(-1);
		return !!next && this.#mine.has(next);
	}

	async undo(): Promise<void> {
		await this.#chain;
		if (this.canUndo) await this.#app.edit.undo();
	}

	async redo(): Promise<void> {
		await this.#chain;
		if (this.canRedo) await this.#app.edit.redo();
	}

	/** Every change written. */
	settled(): Promise<void> {
		return this.#chain;
	}
}
