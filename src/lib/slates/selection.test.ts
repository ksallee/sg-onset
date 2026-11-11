import { describe, expect, it } from 'vitest';
import { clearSelection, dragSpan, EMPTY_SELECTION, extendTo, isAllSelected, pruneSelection, selectAll, selectedIn, toggle, type Selection } from './selection';

const order = ['a', 'b', 'c', 'd', 'e', 'f'];
const of = (...ids: string[]): Selection => ({ ids: new Set(ids), anchor: ids.at(-1) });
const ids = (s: Selection) => [...s.ids].sort();

describe('toggle', () => {
	it('adds or removes one, and makes it the anchor', () => {
		const s = toggle(EMPTY_SELECTION, 'b');
		expect(ids(s)).toEqual(['b']);
		expect(s.anchor).toBe('b');
		const t = toggle(s, 'b');
		expect(ids(t)).toEqual([]);
		expect(t.anchor).toBe('b');
	});
	it('leaves the selection it was given alone', () => {
		const s = of('a');
		toggle(s, 'b');
		expect(ids(s)).toEqual(['a']);
	});
});

describe('extendTo', () => {
	it('selects everything from the anchor to the row, either way, keeping the rest', () => {
		expect(ids(extendTo({ ids: new Set(['f', 'b']), anchor: 'b' }, order, 'd'))).toEqual(['b', 'c', 'd', 'f']);
		expect(ids(extendTo(of('e'), order, 'c'))).toEqual(['c', 'd', 'e']);
	});
	it('with no anchor, or an anchor out of view, toggles the row', () => {
		expect(ids(extendTo(EMPTY_SELECTION, order, 'c'))).toEqual(['c']);
		expect(ids(extendTo({ ids: new Set(['z']), anchor: 'z' }, order, 'c'))).toEqual(['c', 'z']);
	});
});

describe('dragSpan', () => {
	it('dragging from an unselected row selects the span, over what was there before', () => {
		expect(ids(dragSpan(of('f'), order, 'b', 'd'))).toEqual(['b', 'c', 'd', 'f']);
	});
	it('follows the finger back: the span is always from the first row to the current one', () => {
		expect(ids(dragSpan(EMPTY_SELECTION, order, 'b', 'e'))).toEqual(['b', 'c', 'd', 'e']);
		expect(ids(dragSpan(EMPTY_SELECTION, order, 'b', 'c'))).toEqual(['b', 'c']);
		expect(ids(dragSpan(EMPTY_SELECTION, order, 'b', 'a'))).toEqual(['a', 'b']);
	});
	it('dragging from a selected row clears the span instead', () => {
		expect(ids(dragSpan(of('a', 'b', 'c', 'd'), order, 'b', 'c'))).toEqual(['a', 'd']);
	});
	it('makes the first row the anchor', () => {
		expect(dragSpan(EMPTY_SELECTION, order, 'b', 'd').anchor).toBe('b');
	});
	it('a row out of view changes nothing', () => {
		const base = of('a');
		expect(dragSpan(base, order, 'z', 'b')).toBe(base);
	});
});

describe('selectAll and isAllSelected', () => {
	it('selects every row in view, and keeps rows out of view', () => {
		const s = selectAll(of('z'), ['a', 'b']);
		expect(ids(s)).toEqual(['a', 'b', 'z']);
		expect(isAllSelected(s, ['a', 'b'])).toBe(true);
		expect(isAllSelected(s, ['a', 'b', 'c'])).toBe(false);
	});
	it('an empty view is never all selected', () => {
		expect(isAllSelected(of('a'), [])).toBe(false);
	});
});

describe('clearSelection', () => {
	it('clears the rows in view, or everything', () => {
		expect(ids(clearSelection(of('a', 'b', 'z'), ['a', 'b']))).toEqual(['z']);
		expect(ids(clearSelection(of('a', 'b', 'z')))).toEqual([]);
	});
});

describe('pruneSelection', () => {
	it('drops ids that are no longer there, and the anchor with them', () => {
		const s = pruneSelection({ ids: new Set(['a', 'gone']), anchor: 'gone' }, ['a', 'b']);
		expect(ids(s)).toEqual(['a']);
		expect(s.anchor).toBeUndefined();
	});
	it('returns the same selection when nothing is gone', () => {
		const s = of('a');
		expect(pruneSelection(s, order)).toBe(s);
	});
});

describe('selectedIn', () => {
	it('lists the selected rows in view order', () => {
		expect(selectedIn(of('e', 'a', 'z'), order)).toEqual(['a', 'e']);
	});
});
