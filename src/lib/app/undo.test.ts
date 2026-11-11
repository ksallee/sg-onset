import { describe, expect, it } from 'vitest';
import { EMPTY_UNDO, popRedo, popUndo, record, redoActions, undoActions, type UndoEntry } from './undo';

const tStop: UndoEntry = { label: { key: 'edit.changed' }, steps: [{ kind: 'patch', table: 'take', patch: [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }] }] };
const newSlate: UndoEntry = { steps: [{ kind: 'create', table: 'slate', id: 's1' }] };

describe('record', () => {
	it('adds what was done and drops what could be redone', () => {
		const undone = popUndo(record(record(EMPTY_UNDO, tStop), newSlate))!.state;
		expect(undone.future).toHaveLength(1);
		const next = record(undone, newSlate);
		expect(next.past).toEqual([tStop, newSlate]);
		expect(next.future).toEqual([]);
	});
	it('does not keep an entry that changed nothing', () => {
		expect(record(EMPTY_UNDO, { steps: [] })).toBe(EMPTY_UNDO);
		expect(record(EMPTY_UNDO, { steps: [{ kind: 'patch', table: 'take', patch: [] }] })).toBe(EMPTY_UNDO);
	});
	it('drops the empty steps of an entry that has others', () => {
		const entry: UndoEntry = { steps: [{ kind: 'patch', table: 'take', patch: [] }, ...newSlate.steps] };
		expect(record(EMPTY_UNDO, entry).past[0].steps).toEqual(newSlate.steps);
	});
	it('forgets the oldest past the limit', () => {
		let state = EMPTY_UNDO;
		for (let i = 0; i < 5; i++) state = record(state, { steps: [{ kind: 'create', table: 'slate', id: `s${i}` }] }, 3);
		expect(state.past.map((e) => (e.steps[0] as { id: string }).id)).toEqual(['s2', 's3', 's4']);
	});
});

describe('popUndo and popRedo', () => {
	it('move the last entry across and back', () => {
		const done = record(record(EMPTY_UNDO, tStop), newSlate);
		const undo = popUndo(done)!;
		expect(undo.entry).toBe(done.past[1]);
		expect(undo.state).toEqual({ past: [tStop], future: [newSlate] });
		const redo = popRedo(undo.state)!;
		expect(redo.entry).toEqual(newSlate);
		expect(redo.state).toEqual(done);
	});
	it('have nothing to give on an empty side', () => {
		expect(popUndo(EMPTY_UNDO)).toBeUndefined();
		expect(popRedo(record(EMPTY_UNDO, tStop))).toBeUndefined();
	});
});

describe('undoActions', () => {
	it('inverts a patch', () => {
		expect(undoActions(tStop)).toEqual([{ do: 'apply', table: 'take', patch: [{ id: 't1', key: 'tStop', from: 4, to: 2.8 }] }]);
	});
	it('removes what was created and restores what was removed, last step first', () => {
		const entry: UndoEntry = {
			steps: [
				{ kind: 'create', table: 'slate', id: 's1' },
				{ kind: 'create', table: 'take', id: 't1' },
				{ kind: 'remove', table: 'take', id: 't0' }
			]
		};
		expect(undoActions(entry)).toEqual([
			{ do: 'restore', table: 'take', id: 't0' },
			{ do: 'remove', table: 'take', id: 't1' },
			{ do: 'remove', table: 'slate', id: 's1' }
		]);
	});
});

describe('redoActions', () => {
	it('does the steps again in order: the patch, the create from the trash, the remove', () => {
		const entry: UndoEntry = { steps: [...newSlate.steps, ...tStop.steps, { kind: 'remove', table: 'take', id: 't0' }] };
		expect(redoActions(entry)).toEqual([
			{ do: 'restore', table: 'slate', id: 's1' },
			{ do: 'apply', table: 'take', patch: [{ id: 't1', key: 'tStop', from: 2.8, to: 4 }] },
			{ do: 'remove', table: 'take', id: 't0' }
		]);
	});
});
