import { describe, expect, it } from 'vitest';
import type { Dimension, Figure, Shape, Stroke, TextNote } from './drawing';
import {
	angleTo,
	dimensionParts,
	distanceToSegment,
	figureParts,
	fitView,
	flatSize,
	handles,
	heading,
	hitHandle,
	hitShape,
	hitTest,
	paintOrder,
	textBox,
	toDrawing
} from './geometry';

const stroke = (id: string, points: number[]): Stroke => ({ kind: 'stroke', id, ink: 'red', width: 10, points });
const text = (id: string, over: Partial<TextNote> = {}): TextNote => ({ kind: 'text', id, ink: 'red', at: { x: 100, y: 100 }, size: 20, text: 'Mark', ...over });
const dim = (id: string, over: Partial<Dimension> = {}): Dimension => ({ kind: 'dimension', id, ink: 'yellow', a: { x: 0, y: 50 }, b: { x: 200, y: 50 }, width: 4, size: 20, ...over });
const fig = (id: string, over: Partial<Figure> = {}): Figure => ({ kind: 'symbol', id, symbol: 'camera', ink: 'black', at: { x: 300, y: 300 }, rotation: 0, size: 40, ...over });

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
	expect(a.x).toBeCloseTo(b.x);
	expect(a.y).toBeCloseTo(b.y);
};

describe('distanceToSegment', () => {
	it('measures to the nearest point of the segment, ends included', () => {
		expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
		expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
		expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
	});
});

describe('heading and angleTo', () => {
	it('faces the top at 0 and turns clockwise', () => {
		close(heading(0), { x: 0, y: -1 });
		close(heading(90), { x: 1, y: 0 });
		close(heading(180), { x: 0, y: 1 });
	});
	it('gives the angle from a centre to a point, 0 up to 360', () => {
		expect(angleTo({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0);
		expect(angleTo({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
		expect(angleTo({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270);
	});
});

describe('textBox', () => {
	it('is centred on the text point and grows with the text', () => {
		const box = textBox(text('t'));
		expect(box.x + box.width / 2).toBeCloseTo(100);
		expect(box.y + box.height / 2).toBeCloseTo(100);
		expect(textBox(text('t', { text: 'Marker eight' })).width).toBeGreaterThan(box.width);
	});
});

describe('dimensionParts', () => {
	it('puts a tick across each end and the label above the middle', () => {
		const parts = dimensionParts(dim('d'));
		expect(parts.ticks).toHaveLength(2);
		close(parts.ticks[0][0], { x: 0, y: 40 });
		close(parts.ticks[0][1], { x: 0, y: 60 });
		expect(parts.label.angle).toBeCloseTo(0);
		expect(parts.label.at.x).toBeCloseTo(100);
		expect(parts.label.at.y).toBeLessThan(50);
	});
	it('keeps the label upright whichever way the line was drawn', () => {
		const back = dimensionParts(dim('d', { a: { x: 200, y: 50 }, b: { x: 0, y: 50 } }));
		expect(back.label.angle).toBeCloseTo(0);
		expect(back.label.at.y).toBeLessThan(50);
		const up = dimensionParts(dim('d', { a: { x: 0, y: 200 }, b: { x: 0, y: 0 } }));
		expect(Math.abs(up.label.angle)).toBeCloseTo(90);
	});
});

describe('figureParts', () => {
	it('draws a camera facing the way it is turned', () => {
		const lens = (f: Figure) => figureParts(f)[1];
		const up = lens(fig('f'));
		expect(up.kind).toBe('poly');
		if (up.kind !== 'poly') return;
		expect(Math.min(...up.points.map((p) => p.y))).toBeLessThan(300);
		const right = lens(fig('f', { rotation: 90 }));
		if (right.kind !== 'poly') return;
		expect(Math.max(...right.points.map((p) => p.x))).toBeGreaterThan(315);
		expect(Math.min(...right.points.map((p) => p.y))).toBeGreaterThan(280);
	});
	it('has parts for every symbol', () => {
		for (const symbol of ['camera', 'subject', 'light', 'marker'] as const) expect(figureParts(fig('f', { symbol })).length).toBeGreaterThan(1);
	});
});

describe('paintOrder', () => {
	it('paints strokes, then dimension lines, then symbols, then text, each in the order made', () => {
		const shapes: Shape[] = [text('t1'), fig('f1'), stroke('s1', [0, 0, 1, 1]), dim('d1'), stroke('s2', [0, 0, 1, 1]), text('t2')];
		expect(paintOrder(shapes).map((s) => s.id)).toEqual(['s1', 's2', 'd1', 'f1', 't1', 't2']);
	});
});

describe('hitShape', () => {
	it('hits a stroke near its line', () => {
		const s = stroke('s', [0, 0, 100, 0]);
		expect(hitShape(s, { x: 50, y: 8 }, 4)).toBe(true);
		expect(hitShape(s, { x: 50, y: 20 }, 4)).toBe(false);
	});
	it('hits text inside its box, a dimension near its line, a symbol near its centre', () => {
		expect(hitShape(text('t'), { x: 100, y: 105 }, 0)).toBe(true);
		expect(hitShape(text('t'), { x: 100, y: 160 }, 0)).toBe(false);
		expect(hitShape(dim('d'), { x: 120, y: 56 }, 4)).toBe(true);
		expect(hitShape(fig('f'), { x: 320, y: 300 }, 0)).toBe(true);
		expect(hitShape(fig('f'), { x: 400, y: 300 }, 0)).toBe(false);
	});
});

describe('hitTest', () => {
	it('gives the shape on top', () => {
		const shapes: Shape[] = [text('t1', { at: { x: 50, y: 50 } }), stroke('s1', [0, 50, 100, 50])];
		expect(hitTest(shapes, { x: 50, y: 50 }, 4)).toBe('t1');
		expect(hitTest(shapes, { x: 5, y: 52 }, 4)).toBe('s1');
		expect(hitTest(shapes, { x: 500, y: 500 }, 4)).toBeUndefined();
	});
});

describe('handles', () => {
	it('gives a dimension line its two ends and a symbol its turn handle, in front of it', () => {
		expect(handles(dim('d')).map((h) => h.handle)).toEqual(['a', 'b']);
		const [turn] = handles(fig('f', { rotation: 90 }));
		expect(turn.handle).toBe('turn');
		expect(turn.at.x).toBeGreaterThan(300);
		expect(turn.at.y).toBeCloseTo(300);
		expect(handles(text('t'))).toEqual([]);
	});
	it('finds the handle under a point', () => {
		expect(hitHandle(dim('d'), { x: 198, y: 52 }, 6)).toBe('b');
		expect(hitHandle(dim('d'), { x: 100, y: 50 }, 6)).toBeUndefined();
	});
});

describe('fitView and toDrawing', () => {
	it('fits the drawing in the box, whole, at the largest scale', () => {
		expect(fitView({ width: 1000, height: 1000 }, { width: 4000, height: 3000 })).toEqual({ scale: 0.25, width: 1000, height: 750 });
		expect(fitView({ width: 1000, height: 300 }, { width: 400, height: 300 })).toEqual({ scale: 1, width: 400, height: 300 });
	});
	it('takes a point on screen to the drawing', () => {
		expect(toDrawing({ scale: 0.25, width: 1000, height: 750 }, { x: 100, y: 40 })).toEqual({ x: 400, y: 160 });
	});
	it('gives an empty view to an empty box', () => {
		expect(fitView({ width: 0, height: 500 }, { width: 400, height: 300 }).scale).toBe(0);
	});
});

describe('flatSize', () => {
	it('keeps a photo that fits, and scales one that does not, keeping its shape', () => {
		expect(flatSize(4032, 3024, 16_777_216)).toEqual({ width: 4032, height: 3024 });
		const big = flatSize(8064, 6048, 16_777_216);
		expect(big.width * big.height).toBeLessThanOrEqual(16_777_216);
		expect(big.width / big.height).toBeCloseTo(8064 / 6048, 2);
	});
});
