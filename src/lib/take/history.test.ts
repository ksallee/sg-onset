import { describe, expect, it } from 'vitest';
import { commit, emptyHistory, undo } from './history';

describe('history', () => {
	it('has nothing to undo at first', () => {
		expect(undo(emptyHistory<number>())).toBeNull();
	});
	it('gives back the last state and its label, newest first', () => {
		let h = emptyHistory<number>();
		h = commit(h, 1, 'one');
		h = commit(h, 2, 'two');
		const a = undo(h)!;
		expect(a.state).toBe(2);
		expect(a.label).toBe('two');
		const b = undo(a.history)!;
		expect(b.state).toBe(1);
		expect(undo(b.history)).toBeNull();
	});
	it('forgets the oldest past the cap', () => {
		let h = emptyHistory<number>();
		for (let i = 0; i < 5; i++) h = commit(h, i, String(i), 3);
		expect(h.past.map((p) => p.state)).toEqual([2, 3, 4]);
	});
});
