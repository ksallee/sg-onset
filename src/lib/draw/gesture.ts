// What a finger or the pen does on a drawing: a reducer from pointer events to the gesture under
// way, and on the way up the change to save or the question to ask. The canvas component feeds it
// points already in drawing units; it holds no state of its own. Pure.
//
// - The tool decides what a press starts: a stroke, a dimension line, a text, a symbol, a move.
// - A handle of the selected shape wins over the tool: the ends of a dimension line, a symbol's
//   turn handle. So a shape can be fixed without changing tools.
// - A second pointer cancels the gesture under way and keeps nothing of it: two fingers are not
//   a drawing.
// - Once the pen has drawn, a finger draws nothing with a drawing tool on: it is a palm on the
//   glass. Move still takes a finger.

import { addShape, clampPoint, makeStroke, moveShape, replaceShape, setEnd, turnShape, type Dimension, type Figure, type Ink, type Point, type Shape, type Size, type Stroke, type SymbolKind } from './drawing';
import { angleTo, distance, hitHandle, hitTest, type Handle } from './geometry';

export type Tool = 'move' | 'draw' | 'text' | 'measure' | SymbolKind;
export type Pointer = { id: number; kind: 'pen' | 'touch' | 'mouse'; at: Point };

export type Gesture =
	| { kind: 'idle' }
	| { kind: 'stroke'; pointer: number; points: Point[] }
	| { kind: 'measure'; pointer: number; a: Point; b: Point }
	| { kind: 'drag'; pointer: number; id: string; part: 'body' | Handle; start: Point; at: Point; moved: boolean; wasSelected: boolean }
	| { kind: 'tap'; pointer: number; start: Point; moved: boolean; on?: string };

export const IDLE: Gesture = { kind: 'idle' };

export type Context = {
	tool: Tool;
	ink: Ink;
	shapes: readonly Shape[];
	size: Size;
	selected: string | null;
	penSeen: boolean;
	/** How near a shape a press must land to touch it, in drawing units. */
	tol: number;
	/** How far a press may wander and still be a tap, in drawing units. */
	slop: number;
	style: { stroke: number; text: number; symbol: number };
	newId: () => string;
};

/** What to ask the person: the text of a new or tapped text, or the length of a dimension line. */
export type Ask = { kind: 'text'; id?: string; at: Point } | { kind: 'value'; id: string };
/** What a change was, for its undo label. */
export type Change = 'draw' | 'measure' | 'place' | 'move' | 'turn';

export type Result = {
	gesture: Gesture;
	selected?: string | null;
	penSeen?: boolean;
	commit?: { shapes: Shape[]; change: Change };
	ask?: Ask;
};

const find = (ctx: Context, id: string | null | undefined) => (id ? ctx.shapes.find((s) => s.id === id) : undefined);
const hitKind = (ctx: Context, p: Point, kind: Shape['kind']) =>
	hitTest(
		ctx.shapes.filter((s) => s.kind === kind),
		p,
		ctx.tol
	);

export function pointerDown(g: Gesture, ctx: Context, p: Pointer): Result {
	if (g.kind !== 'idle') return { gesture: IDLE };
	const pen = p.kind === 'pen' ? { penSeen: true } : {};
	if (p.kind === 'touch' && ctx.penSeen && ctx.tool !== 'move') return { gesture: IDLE };
	const at = p.at;

	const selected = find(ctx, ctx.selected);
	const handle = selected && hitHandle(selected, at, ctx.tol * 1.5);
	if (selected && handle) return { ...pen, gesture: { kind: 'drag', pointer: p.id, id: selected.id, part: handle, start: at, at, moved: false, wasSelected: true } };

	switch (ctx.tool) {
		case 'draw':
			return { ...pen, gesture: { kind: 'stroke', pointer: p.id, points: [clampPoint(at, ctx.size)] } };
		case 'measure': {
			const a = clampPoint(at, ctx.size);
			return { ...pen, gesture: { kind: 'measure', pointer: p.id, a, b: a } };
		}
		case 'text': {
			const on = hitKind(ctx, at, 'text');
			return { ...pen, gesture: { kind: 'tap', pointer: p.id, start: at, moved: false, ...(on ? { on } : {}) } };
		}
		case 'move': {
			const id = hitTest(ctx.shapes, at, ctx.tol);
			if (!id) return { ...pen, gesture: { kind: 'tap', pointer: p.id, start: at, moved: false } };
			return { ...pen, selected: id, gesture: { kind: 'drag', pointer: p.id, id, part: 'body', start: at, at, moved: false, wasSelected: id === ctx.selected } };
		}
		default:
			return { ...pen, gesture: { kind: 'tap', pointer: p.id, start: at, moved: false } };
	}
}

export function pointerMove(g: Gesture, ctx: Context, p: Pointer): Result {
	if (g.kind === 'idle' || g.pointer !== p.id) return { gesture: g };
	switch (g.kind) {
		case 'stroke': {
			const point = clampPoint(p.at, ctx.size);
			const prev = g.points[g.points.length - 1];
			return { gesture: distance(prev, point) < ctx.tol / 8 ? g : { ...g, points: [...g.points, point] } };
		}
		case 'measure':
			return { gesture: { ...g, b: clampPoint(p.at, ctx.size) } };
		case 'drag':
			return { gesture: { ...g, at: p.at, moved: g.moved || distance(g.start, p.at) > ctx.slop } };
		case 'tap':
			return { gesture: { ...g, moved: g.moved || distance(g.start, p.at) > ctx.slop } };
	}
}

/** The shapes with a drag applied, as they would be saved. */
function dragged(shapes: readonly Shape[], g: Extract<Gesture, { kind: 'drag' }>): Shape[] {
	const shape = shapes.find((s) => s.id === g.id);
	if (!shape) return [...shapes];
	if (g.part === 'body') return replaceShape(shapes, moveShape(shape, g.at.x - g.start.x, g.at.y - g.start.y));
	if (g.part === 'turn' && shape.kind === 'symbol') return replaceShape(shapes, turnShape(shape, angleTo(shape.at, g.at)));
	if ((g.part === 'a' || g.part === 'b') && shape.kind === 'dimension') return replaceShape(shapes, setEnd(shape, g.part, g.at));
	return [...shapes];
}

function dimension(ctx: Context, id: string, a: Point, b: Point): Dimension {
	return { kind: 'dimension', id, ink: ctx.ink, a, b, width: Math.round(ctx.style.stroke * 6) / 10, size: ctx.style.text };
}

export function pointerUp(g: Gesture, ctx: Context, p: Pointer): Result {
	if (g.kind === 'idle' || g.pointer !== p.id) return { gesture: g };
	const moved = pointerMove(g, ctx, p).gesture;
	switch (moved.kind) {
		case 'stroke':
			return { gesture: IDLE, commit: { shapes: addShape(ctx.shapes, makeStroke(ctx.newId(), moved.points, ctx.ink, ctx.style.stroke)), change: 'draw' } };
		case 'measure': {
			if (distance(moved.a, moved.b) <= ctx.slop) {
				const on = hitKind(ctx, moved.a, 'dimension');
				return on ? { gesture: IDLE, selected: on, ask: { kind: 'value', id: on } } : { gesture: IDLE };
			}
			const id = ctx.newId();
			return { gesture: IDLE, selected: id, commit: { shapes: addShape(ctx.shapes, dimension(ctx, id, moved.a, moved.b)), change: 'measure' }, ask: { kind: 'value', id } };
		}
		case 'drag': {
			if (moved.moved) return { gesture: IDLE, selected: moved.id, commit: { shapes: dragged(ctx.shapes, moved), change: moved.part === 'turn' ? 'turn' : 'move' } };
			const shape = find(ctx, moved.id);
			if (moved.part === 'body' && moved.wasSelected && shape?.kind === 'text') return { gesture: IDLE, selected: moved.id, ask: { kind: 'text', id: shape.id, at: shape.at } };
			if (moved.part === 'body' && moved.wasSelected && shape?.kind === 'dimension') return { gesture: IDLE, selected: moved.id, ask: { kind: 'value', id: shape.id } };
			return { gesture: IDLE, selected: moved.id };
		}
		case 'tap': {
			if (moved.moved) return { gesture: IDLE };
			if (ctx.tool === 'text') {
				const on = find(ctx, moved.on);
				return on?.kind === 'text' ? { gesture: IDLE, selected: on.id, ask: { kind: 'text', id: on.id, at: on.at } } : { gesture: IDLE, ask: { kind: 'text', at: moved.start } };
			}
			if (ctx.tool === 'move') return { gesture: IDLE, selected: null };
			if (ctx.tool === 'draw' || ctx.tool === 'measure') return { gesture: IDLE };
			const id = ctx.newId();
			const figure: Figure = { kind: 'symbol', id, symbol: ctx.tool, ink: ctx.ink, at: clampPoint(moved.start, ctx.size), rotation: 0, size: ctx.style.symbol };
			return { gesture: IDLE, selected: id, commit: { shapes: addShape(ctx.shapes, figure), change: 'place' } };
		}
		default:
			return { gesture: IDLE };
	}
}

export function pointerCancel(_g: Gesture): Result {
	return { gesture: IDLE };
}

/** What to show while a gesture is under way: the shapes as they would be saved, and the line being drawn. */
export function preview(shapes: readonly Shape[], g: Gesture, ctx: Pick<Context, 'ink' | 'style'>): { shapes: readonly Shape[]; live?: Stroke | Dimension } {
	switch (g.kind) {
		case 'stroke':
			return { shapes, live: { kind: 'stroke', id: 'live', ink: ctx.ink, width: ctx.style.stroke, points: g.points.flatMap((p) => [p.x, p.y]) } };
		case 'measure':
			return { shapes, live: dimension(ctx as Context, 'live', g.a, g.b) };
		case 'drag':
			return { shapes: g.moved ? dragged(shapes, g) : shapes };
		default:
			return { shapes };
	}
}
