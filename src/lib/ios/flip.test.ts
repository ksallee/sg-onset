import { describe, expect, it } from 'vitest';
import { flipDelta, listDiff, type Box } from './flip';

const box = (x: number, y: number, w = 100, h = 44): Box => ({ x, y, w, h });

describe('flipDelta', () => {
	it('is the move and the scale that put the new box where the old one was', () => {
		expect(flipDelta(box(10, 20, 100, 40), box(110, 60, 50, 80))).toEqual({ dx: -100, dy: -40, sx: 2, sy: 0.5, moved: true });
	});
	it('under half a pixel and a hundredth of scale is no move', () => {
		expect(flipDelta(box(10, 20), box(10.3, 20.2)).moved).toBe(false);
		expect(flipDelta(box(10, 20, 100, 44), box(10, 20, 100.4, 44)).moved).toBe(false);
	});
	it('a box with no size does not scale', () => {
		expect(flipDelta(box(0, 0, 100, 44), box(0, 10, 0, 0))).toMatchObject({ sx: 1, sy: 1, dy: -10 });
	});
});

describe('listDiff', () => {
	const before = new Map([
		['a', box(0, 0)],
		['b', box(0, 44)],
		['c', box(0, 88)]
	]);
	it('a removed entry leaves, the ones under it move up', () => {
		const after = new Map([
			['a', box(0, 0)],
			['c', box(0, 44)]
		]);
		expect(listDiff(before, after)).toEqual({ entered: [], left: ['b'], moved: [{ key: 'c', dx: 0, dy: 44 }] });
	});
	it('a new entry enters, the ones under it move down', () => {
		const after = new Map([
			['a', box(0, 0)],
			['n', box(0, 44)],
			['b', box(0, 88)],
			['c', box(0, 132)]
		]);
		expect(listDiff(before, after)).toEqual({
			entered: ['n'],
			left: [],
			moved: [
				{ key: 'b', dx: 0, dy: -44 },
				{ key: 'c', dx: 0, dy: -44 }
			]
		});
	});
	it('a reorder moves both ways', () => {
		const after = new Map([
			['c', box(0, 0)],
			['a', box(0, 44)],
			['b', box(0, 88)]
		]);
		expect(listDiff(before, after).moved).toEqual([
			{ key: 'c', dx: 0, dy: 88 },
			{ key: 'a', dx: 0, dy: -44 },
			{ key: 'b', dx: 0, dy: -44 }
		]);
	});
	it('nothing changed: nothing moves', () => {
		expect(listDiff(before, new Map(before))).toEqual({ entered: [], left: [], moved: [] });
	});
});
