import { describe, expect, it } from 'vitest';
import type { Dimension, Figure, Point, Shape, Stroke, TextNote } from './drawing';
import { IDLE, pointerCancel, pointerDown, pointerMove, pointerUp, preview, type Context, type Gesture, type Pointer, type Result } from './gesture';

const text = (id: string, at: Point): TextNote => ({ kind: 'text', id, ink: 'red', at, size: 20, text: 'Mark' });
const dim = (id: string): Dimension => ({ kind: 'dimension', id, ink: 'yellow', a: { x: 100, y: 300 }, b: { x: 300, y: 300 }, width: 4, size: 20 });
const fig = (id: string): Figure => ({ kind: 'symbol', id, symbol: 'camera', ink: 'black', at: { x: 500, y: 500 }, rotation: 0, size: 40 });

function context(over: Partial<Context> = {}): Context {
	let n = 0;
	return {
		tool: 'draw',
		ink: 'red',
		shapes: [],
		size: { width: 1000, height: 800 },
		selected: null,
		penSeen: false,
		tol: 10,
		slop: 6,
		style: { stroke: 8, text: 30, symbol: 40 },
		newId: () => `new${++n}`,
		...over
	};
}

const at = (x: number, y: number, kind: Pointer['kind'] = 'touch', id = 1): Pointer => ({ id, kind, at: { x, y } });

/** Runs down, moves, up through the reducer and gives every result. */
function run(ctx: Context, path: Point[], kind: Pointer['kind'] = 'touch'): Result[] {
	const out: Result[] = [];
	let g: Gesture = IDLE;
	path.forEach((p, i) => {
		const ptr = at(p.x, p.y, kind);
		const r = i === 0 ? pointerDown(g, ctx, ptr) : i === path.length - 1 ? pointerUp(g, ctx, ptr) : pointerMove(g, ctx, ptr);
		out.push(r);
		g = r.gesture;
	});
	return out;
}
const last = (rs: Result[]) => rs[rs.length - 1];

describe('drawing', () => {
	it('makes a stroke of the path, in the ink and width of the moment', () => {
		const r = last(run(context(), [{ x: 10, y: 10 }, { x: 50, y: 12 }, { x: 100, y: 10 }, { x: 100, y: 80 }]));
		expect(r.gesture).toEqual(IDLE);
		expect(r.commit?.change).toBe('draw');
		const s = r.commit!.shapes[0] as Stroke;
		expect(s).toMatchObject({ kind: 'stroke', id: 'new1', ink: 'red', width: 8 });
		expect(s.points.slice(0, 2)).toEqual([10, 10]);
		expect(s.points.slice(-2)).toEqual([100, 80]);
	});
	it('keeps a stroke on the drawing', () => {
		const r = last(run(context(), [{ x: 10, y: 10 }, { x: -50, y: 900 }]));
		expect((r.commit!.shapes[0] as Stroke).points.slice(-2)).toEqual([0, 800]);
	});
	it('shows the stroke as it is drawn', () => {
		const ctx = context();
		const rs = run(ctx, [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 90, y: 10 }]);
		const shown = preview(ctx.shapes, rs[1].gesture, ctx);
		expect(shown.live?.kind).toBe('stroke');
	});
	it('stops a stroke when a second finger lands, and keeps nothing of it', () => {
		const ctx = context();
		const first = pointerDown(IDLE, ctx, at(10, 10));
		const moved = pointerMove(first.gesture, ctx, at(50, 50));
		const second = pointerDown(moved.gesture, ctx, at(300, 300, 'touch', 2));
		expect(second.gesture).toEqual(IDLE);
		expect(pointerUp(second.gesture, ctx, at(60, 60)).commit).toBeUndefined();
	});
	it('cancels on a cancel', () => {
		const down = pointerDown(IDLE, context(), at(10, 10));
		expect(pointerCancel(down.gesture)).toEqual({ gesture: IDLE });
	});
});

describe('the pen', () => {
	it('is remembered once it draws', () => {
		expect(pointerDown(IDLE, context(), at(1, 1, 'pen')).penSeen).toBe(true);
	});
	it('makes a finger draw nothing while a drawing tool is on: a palm on the glass', () => {
		const ctx = context({ penSeen: true });
		const r = last(run(ctx, [{ x: 10, y: 10 }, { x: 80, y: 80 }]));
		expect(r.commit).toBeUndefined();
	});
	it('still lets a finger move shapes with Move', () => {
		const ctx = context({ penSeen: true, tool: 'move', shapes: [fig('f1')] });
		const r = last(run(ctx, [{ x: 500, y: 500 }, { x: 520, y: 500 }, { x: 560, y: 500 }]));
		expect(r.commit?.change).toBe('move');
	});
});

describe('measuring', () => {
	it('makes a dimension line, selects it and asks for its value', () => {
		const r = last(run(context({ tool: 'measure' }), [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 400, y: 100 }]));
		expect(r.commit?.change).toBe('measure');
		expect(r.commit!.shapes[0]).toMatchObject({ kind: 'dimension', id: 'new1', a: { x: 100, y: 100 }, b: { x: 400, y: 100 }, size: 30 });
		expect(r.selected).toBe('new1');
		expect(r.ask).toEqual({ kind: 'value', id: 'new1' });
	});
	it('takes a tap on a dimension line as a wish to type its value', () => {
		const r = last(run(context({ tool: 'measure', shapes: [dim('d1')] }), [{ x: 200, y: 302 }, { x: 201, y: 302 }]));
		expect(r.commit).toBeUndefined();
		expect(r.ask).toEqual({ kind: 'value', id: 'd1' });
	});
	it('makes nothing of a short tap on nothing', () => {
		const r = last(run(context({ tool: 'measure' }), [{ x: 100, y: 100 }, { x: 102, y: 100 }]));
		expect(r.commit).toBeUndefined();
		expect(r.ask).toBeUndefined();
	});
});

describe('text', () => {
	it('asks for a new text where the tap was', () => {
		const r = last(run(context({ tool: 'text' }), [{ x: 120, y: 140 }, { x: 121, y: 140 }]));
		expect(r.ask).toEqual({ kind: 'text', at: { x: 120, y: 140 } });
	});
	it('asks to change a text tapped', () => {
		const r = last(run(context({ tool: 'text', shapes: [text('t1', { x: 50, y: 50 })] }), [{ x: 50, y: 52 }, { x: 50, y: 52 }]));
		expect(r.ask).toEqual({ kind: 'text', id: 't1', at: { x: 50, y: 50 } });
		expect(r.selected).toBe('t1');
	});
	it('asks nothing after a drag', () => {
		const r = last(run(context({ tool: 'text' }), [{ x: 120, y: 140 }, { x: 220, y: 140 }]));
		expect(r.ask).toBeUndefined();
	});
});

describe('symbols', () => {
	it('places the symbol of the tool where the tap was, and selects it', () => {
		const r = last(run(context({ tool: 'light', ink: 'black' }), [{ x: 300, y: 200 }, { x: 300, y: 200 }]));
		expect(r.commit?.change).toBe('place');
		expect(r.commit!.shapes[0]).toEqual({ kind: 'symbol', id: 'new1', symbol: 'light', ink: 'black', at: { x: 300, y: 200 }, rotation: 0, size: 40 });
		expect(r.selected).toBe('new1');
	});
});

describe('moving', () => {
	const shapes: Shape[] = [text('t1', { x: 50, y: 50 }), dim('d1'), fig('f1')];
	it('selects the shape under the finger on the way down', () => {
		expect(pointerDown(IDLE, context({ tool: 'move', shapes }), at(50, 50)).selected).toBe('t1');
	});
	it('moves the shape by the drag, and shows it moving', () => {
		const ctx = context({ tool: 'move', shapes });
		const rs = run(ctx, [{ x: 50, y: 50 }, { x: 70, y: 60 }, { x: 90, y: 70 }]);
		expect(preview(shapes, rs[1].gesture, ctx).shapes[0]).toMatchObject({ at: { x: 70, y: 60 } });
		expect(last(rs).commit).toEqual({ shapes: [text('t1', { x: 90, y: 70 }), dim('d1'), fig('f1')], change: 'move' });
	});
	it('takes a tap on nothing as letting go of the selection', () => {
		expect(last(run(context({ tool: 'move', shapes, selected: 't1' }), [{ x: 900, y: 50 }, { x: 900, y: 50 }])).selected).toBeNull();
	});
	it('asks to change a selected text or dimension line tapped again', () => {
		expect(last(run(context({ tool: 'move', shapes, selected: 't1' }), [{ x: 50, y: 50 }, { x: 50, y: 50 }])).ask).toEqual({ kind: 'text', id: 't1', at: { x: 50, y: 50 } });
		expect(last(run(context({ tool: 'move', shapes, selected: 'd1' }), [{ x: 200, y: 300 }, { x: 200, y: 300 }])).ask).toEqual({ kind: 'value', id: 'd1' });
		expect(last(run(context({ tool: 'move', shapes }), [{ x: 50, y: 50 }, { x: 50, y: 50 }])).ask).toBeUndefined();
	});
	it('moves one end of a selected dimension line by its handle, whatever the tool', () => {
		const r = last(run(context({ tool: 'draw', shapes, selected: 'd1' }), [{ x: 300, y: 300 }, { x: 300, y: 350 }, { x: 300, y: 400 }]));
		expect(r.commit?.shapes[1]).toMatchObject({ a: { x: 100, y: 300 }, b: { x: 300, y: 400 } });
	});
	it('turns a selected symbol by its handle', () => {
		// The handle sits in front of the camera, 1.6 sizes up: (500, 436).
		const r = last(run(context({ tool: 'move', shapes, selected: 'f1' }), [{ x: 500, y: 436 }, { x: 540, y: 470 }, { x: 600, y: 500 }]));
		expect(r.commit?.change).toBe('turn');
		expect((r.commit!.shapes[2] as Figure).rotation).toBe(90);
	});
});
