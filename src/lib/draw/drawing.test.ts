import { describe, expect, it } from 'vitest';
import { parseLength } from '$lib/model/length';
import {
	addShape,
	addText,
	clampPoint,
	INKS,
	isBlank,
	makeStroke,
	moveShape,
	readLength,
	removeShape,
	replaceShape,
	setEnd,
	setText,
	setValue,
	simplify,
	styleFor,
	turnShape,
	type Dimension,
	type Figure,
	type Shape,
	type Stroke,
	type TextNote
} from './drawing';

const text = (id: string, over: Partial<TextNote> = {}): TextNote => ({ kind: 'text', id, ink: 'red', at: { x: 10, y: 10 }, size: 20, text: 'Hi', ...over });
const dim = (id: string, over: Partial<Dimension> = {}): Dimension => ({ kind: 'dimension', id, ink: 'yellow', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, width: 4, size: 20, ...over });
const fig = (id: string, over: Partial<Figure> = {}): Figure => ({ kind: 'symbol', id, symbol: 'camera', ink: 'black', at: { x: 50, y: 50 }, rotation: 0, size: 40, ...over });

describe('INKS', () => {
	it('holds a colour per ink, as the flattened image draws it', () => {
		expect(Object.keys(INKS)).toEqual(['red', 'yellow', 'blue', 'white', 'black']);
		for (const hex of Object.values(INKS)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
	});
});

describe('styleFor', () => {
	it('scales the pen, the text and the symbols with the drawing', () => {
		const big = styleFor({ width: 4000, height: 3000 });
		const small = styleFor({ width: 1600, height: 1200 });
		expect(big.stroke).toBe(20);
		expect(small.stroke).toBe(8);
		expect(big.text / small.text).toBeCloseTo(2.5);
		expect(small.symbol).toBeGreaterThan(small.text);
	});
	it('keeps a floor for a tiny photo', () => {
		expect(styleFor({ width: 10, height: 10 })).toEqual(styleFor({ width: 400, height: 300 }));
	});
});

describe('simplify', () => {
	it('drops points that sit on the line', () => {
		const pts = [0, 1, 2, 3, 4, 5].map((x) => ({ x: x * 10, y: 0 }));
		expect(simplify(pts, 1)).toEqual([
			{ x: 0, y: 0 },
			{ x: 50, y: 0 }
		]);
	});
	it('keeps a corner', () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 50, y: 1 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 }
		];
		expect(simplify(pts, 2)).toEqual([
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 }
		]);
	});
	it('leaves one or two points alone', () => {
		expect(simplify([{ x: 1, y: 1 }], 5)).toEqual([{ x: 1, y: 1 }]);
	});
});

describe('makeStroke', () => {
	it('stores the points flat, simplified and rounded to a tenth', () => {
		const s = makeStroke('s1', [
			{ x: 0.123, y: 0 },
			{ x: 5, y: 0.01 },
			{ x: 10.06, y: 0 }
		], 'red', 8);
		expect(s).toEqual({ kind: 'stroke', id: 's1', ink: 'red', width: 8, points: [0.1, 0, 10.1, 0] });
	});
	it('makes a dot of a single point', () => {
		expect(makeStroke('s1', [{ x: 3, y: 4 }], 'red', 8).points).toEqual([3, 4, 3, 4]);
	});
});

describe('shape lists', () => {
	const list: Shape[] = [text('t1'), dim('d1')];
	it('adds at the end, replaces in place, removes by id', () => {
		expect(addShape(list, fig('f1')).map((s) => s.id)).toEqual(['t1', 'd1', 'f1']);
		expect(replaceShape(list, text('t1', { text: 'Bye' }))[0]).toMatchObject({ text: 'Bye' });
		expect(replaceShape(list, text('nope')).map((s) => s.id)).toEqual(['t1', 'd1']);
		expect(removeShape(list, 't1').map((s) => s.id)).toEqual(['d1']);
	});
	it('never changes the list it was given', () => {
		const copy = structuredClone(list);
		addShape(list, fig('f1'));
		removeShape(list, 'd1');
		expect(list).toEqual(copy);
	});
});

describe('moveShape', () => {
	it('moves every point of a shape', () => {
		const s: Stroke = { kind: 'stroke', id: 's', ink: 'red', width: 2, points: [0, 0, 10, 10] };
		expect(moveShape(s, 5, -5)).toMatchObject({ points: [5, -5, 15, 5] });
		expect(moveShape(text('t'), 1, 2)).toMatchObject({ at: { x: 11, y: 12 } });
		expect(moveShape(dim('d'), 1, 1)).toMatchObject({ a: { x: 1, y: 1 }, b: { x: 101, y: 1 } });
		expect(moveShape(fig('f'), -10, 0)).toMatchObject({ at: { x: 40, y: 50 } });
	});
});

describe('setEnd and turnShape', () => {
	it('moves one end of a dimension line', () => {
		expect(setEnd(dim('d'), 'b', { x: 0, y: 80 })).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 0, y: 80 } });
	});
	it('turns a symbol, kept to 0 up to 360 and whole degrees', () => {
		expect(turnShape(fig('f'), 90.4).rotation).toBe(90);
		expect(turnShape(fig('f'), -90).rotation).toBe(270);
		expect(turnShape(fig('f'), 360).rotation).toBe(0);
	});
});

describe('setText', () => {
	it('sets the text, trimmed', () => {
		expect(setText([text('t1')], 't1', '  Marker 3 ')[0]).toMatchObject({ text: 'Marker 3' });
	});
	it('removes a text left empty', () => {
		expect(setText([text('t1'), dim('d1')], 't1', '   ')).toEqual([dim('d1')]);
	});
});

describe('setValue', () => {
	it('puts a typed length on a dimension line, and takes it off', () => {
		const value = parseLength("6' 3\"", 'imperial')!;
		const withValue = setValue([dim('d1')], 'd1', value);
		expect(withValue[0]).toMatchObject({ value });
		expect(setValue(withValue, 'd1', undefined)[0]).not.toHaveProperty('value');
	});
	it('touches nothing but a dimension line', () => {
		expect(setValue([text('t1')], 't1', parseLength('2 m', 'metric')!)).toEqual([text('t1')]);
	});
});

describe('addText', () => {
	it('adds a text where it was asked, trimmed', () => {
		expect(addText([], { id: 't9', at: { x: 5, y: 6 }, text: ' Grey ball ', ink: 'yellow', size: 30 })).toEqual([{ kind: 'text', id: 't9', ink: 'yellow', at: { x: 5, y: 6 }, size: 30, text: 'Grey ball' }]);
	});
	it('adds nothing for an empty text', () => {
		expect(addText([dim('d1')], { id: 't9', at: { x: 5, y: 6 }, text: '  ', ink: 'red', size: 30 })).toEqual([dim('d1')]);
	});
});

describe('readLength', () => {
	it('reads a length as the units setting reads it, and keeps what was typed', () => {
		expect(readLength('2.5', 'metric')).toEqual({ ok: true, value: { m: 2.5, entered: { text: '2.5', system: 'metric' } } });
		expect(readLength("8' 2\"", 'metric')).toMatchObject({ ok: true, value: { entered: { system: 'imperial' } } });
	});
	it('takes an empty text as no value', () => {
		expect(readLength('  ', 'metric')).toEqual({ ok: true });
	});
	it('refuses what is not a length, infinity and a length below zero', () => {
		expect(readLength('far', 'metric')).toEqual({ ok: false });
		expect(readLength('inf', 'metric')).toEqual({ ok: false });
		expect(readLength('-2 m', 'metric')).toEqual({ ok: false });
	});
});

describe('clampPoint', () => {
	it('keeps a point on the drawing', () => {
		expect(clampPoint({ x: -5, y: 50 }, { width: 100, height: 40 })).toEqual({ x: 0, y: 40 });
	});
});

describe('isBlank', () => {
	it('is a drawing with no shape', () => {
		expect(isBlank({ width: 10, height: 10, shapes: [] })).toBe(true);
		expect(isBlank({ width: 10, height: 10, shapes: [text('t')] })).toBe(false);
		expect(isBlank(undefined)).toBe(true);
	});
});
