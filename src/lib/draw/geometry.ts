// Where the shapes of a drawing sit: hit testing, the parts a dimension line and a symbol are
// drawn with, the order they are painted in, and how a drawing fits a box on screen or a canvas.
// The screen (SVG) and the flattened image (canvas) both draw from these, so they cannot differ.
// Pure.

import type { Dimension, Figure, Point, Shape, Size, Stroke, TextNote } from './drawing';

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function distanceToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	if (len2 === 0) return distance(p, a);
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
	return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** The way a rotation faces, as a unit vector on screen: 0 is up, 90 is right. */
export function heading(rotation: number): Point {
	return { x: Math.sin(rad(rotation)), y: -Math.cos(rad(rotation)) };
}

/** The rotation that faces from `center` to `p`, 0 up to 360. */
export function angleTo(center: Point, p: Point): number {
	return (deg(Math.atan2(p.x - center.x, -(p.y - center.y))) + 360) % 360;
}

export function strokePoints(s: Stroke): Point[] {
	const out: Point[] = [];
	for (let i = 0; i + 1 < s.points.length; i += 2) out.push({ x: s.points[i], y: s.points[i + 1] });
	return out;
}

/** About how wide a character of the app's type is, in ems. Text is not measured: a box to tap is enough. */
const EM = 0.58;

/** The box a text takes, centred on its point. */
export function textBox(t: Pick<TextNote, 'at' | 'size' | 'text'>): { x: number; y: number; width: number; height: number } {
	const width = Math.max(1, t.text.length) * t.size * EM;
	const height = t.size * 1.25;
	return { x: t.at.x - width / 2, y: t.at.y - height / 2, width, height };
}

/**
 * How a dimension line is drawn: a tick across each end, and where its label sits. The label is
 * above the middle of the line and turned with it, never upside down.
 */
export function dimensionParts(d: Dimension): { ticks: [Point, Point][]; label: { at: Point; angle: number } } {
	const dx = d.b.x - d.a.x;
	const dy = d.b.y - d.a.y;
	const len = Math.hypot(dx, dy) || 1;
	const n = { x: -dy / len, y: dx / len };
	const half = d.size / 2;
	const tick = (p: Point): [Point, Point] => [
		{ x: p.x - n.x * half, y: p.y - n.y * half },
		{ x: p.x + n.x * half, y: p.y + n.y * half }
	];
	let angle = deg(Math.atan2(dy, dx));
	if (angle > 90) angle -= 180;
	else if (angle <= -90) angle += 180;
	const up = { x: Math.sin(rad(angle)), y: -Math.cos(rad(angle)) };
	const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
	const lift = d.size * 0.9;
	return { ticks: [tick(d.a), tick(d.b)], label: { at: { x: mid.x + up.x * lift, y: mid.y + up.y * lift }, angle } };
}

/** One part of a symbol, in drawing units. */
export type Part = { kind: 'poly'; points: Point[]; closed: boolean; fill: boolean } | { kind: 'circle'; at: Point; r: number; fill: boolean };

type Local = { kind: 'poly'; points: [number, number][]; closed: boolean; fill: boolean } | { kind: 'circle'; at: [number, number]; r: number; fill: boolean };

/** Each symbol facing up, one unit across. A camera is a body and its lens; a subject a head and its nose; a light a lamp and its doors. */
const SHAPES: Record<Figure['symbol'], Local[]> = {
	camera: [
		{ kind: 'poly', points: [[-0.5, -0.05], [0.5, -0.05], [0.5, 0.6], [-0.5, 0.6]], closed: true, fill: true },
		{ kind: 'poly', points: [[-0.22, -0.05], [0.22, -0.05], [0.38, -0.5], [-0.38, -0.5]], closed: true, fill: false }
	],
	subject: [
		{ kind: 'circle', at: [0, 0], r: 0.42, fill: false },
		{ kind: 'poly', points: [[-0.16, -0.4], [0.16, -0.4], [0, -0.72]], closed: true, fill: true }
	],
	light: [
		{ kind: 'circle', at: [0, 0], r: 0.28, fill: true },
		{ kind: 'poly', points: [[-0.62, -0.8], [-0.32, -0.32], [0.32, -0.32], [0.62, -0.8]], closed: false, fill: false }
	],
	marker: [
		{ kind: 'circle', at: [0, 0], r: 0.42, fill: false },
		{ kind: 'poly', points: [[-0.3, -0.3], [0.3, 0.3]], closed: false, fill: false },
		{ kind: 'poly', points: [[0.3, -0.3], [-0.3, 0.3]], closed: false, fill: false }
	]
};

/** The parts a symbol is drawn with, placed, turned and sized. */
export function figureParts(f: Figure): Part[] {
	const c = Math.cos(rad(f.rotation));
	const s = Math.sin(rad(f.rotation));
	const place = ([u, v]: [number, number]): Point => ({ x: f.at.x + (u * c - v * s) * f.size, y: f.at.y + (u * s + v * c) * f.size });
	return SHAPES[f.symbol].map((p) => (p.kind === 'circle' ? { kind: 'circle', at: place(p.at), r: p.r * f.size, fill: p.fill } : { ...p, points: p.points.map(place) }));
}

/** The line width of a symbol's parts. */
export const figureLine = (f: Figure) => f.size * 0.08;

const LAYER: Record<Shape['kind'], number> = { stroke: 0, dimension: 1, symbol: 2, text: 3 };

/** The order shapes are painted in, on screen and in the flattened image: strokes, dimension lines, symbols, text on top. Within a kind, the order made. */
export function paintOrder(shapes: readonly Shape[]): Shape[] {
	return shapes
		.map((shape, i) => ({ shape, i }))
		.sort((a, b) => LAYER[a.shape.kind] - LAYER[b.shape.kind] || a.i - b.i)
		.map((x) => x.shape);
}

/** Whether `p` touches the shape, with `tol` drawing units to spare. */
export function hitShape(shape: Shape, p: Point, tol: number): boolean {
	switch (shape.kind) {
		case 'stroke': {
			const pts = strokePoints(shape);
			const reach = shape.width / 2 + tol;
			if (pts.length === 1) return distance(p, pts[0]) <= reach;
			for (let i = 1; i < pts.length; i++) if (distanceToSegment(p, pts[i - 1], pts[i]) <= reach) return true;
			return false;
		}
		case 'text': {
			const box = textBox(shape);
			return p.x >= box.x - tol && p.x <= box.x + box.width + tol && p.y >= box.y - tol && p.y <= box.y + box.height + tol;
		}
		case 'dimension':
			return distanceToSegment(p, shape.a, shape.b) <= shape.width / 2 + tol;
		case 'symbol':
			return distance(p, shape.at) <= shape.size * 0.7 + tol;
	}
}

/** The id of the shape on top under `p`. */
export function hitTest(shapes: readonly Shape[], p: Point, tol: number): string | undefined {
	return paintOrder(shapes)
		.reverse()
		.find((s) => hitShape(s, p, tol))?.id;
}

export type Handle = 'a' | 'b' | 'turn';

/** The handles of a selected shape: the ends of a dimension line, the turn handle in front of a symbol. */
export function handles(shape: Shape): { handle: Handle; at: Point }[] {
	if (shape.kind === 'dimension')
		return [
			{ handle: 'a', at: shape.a },
			{ handle: 'b', at: shape.b }
		];
	if (shape.kind === 'symbol') {
		const h = heading(shape.rotation);
		const reach = shape.size * 1.6;
		return [{ handle: 'turn', at: { x: shape.at.x + h.x * reach, y: shape.at.y + h.y * reach } }];
	}
	return [];
}

export function hitHandle(shape: Shape, p: Point, tol: number): Handle | undefined {
	return handles(shape).find((h) => distance(h.at, p) <= tol)?.handle;
}

/** How a drawing shows in a box: the scale that fits it whole, and the size it then takes. */
export type View = { scale: number; width: number; height: number };

export function fitView(box: Size, size: Size): View {
	if (box.width <= 0 || box.height <= 0 || size.width <= 0 || size.height <= 0) return { scale: 0, width: 0, height: 0 };
	const scale = Math.min(box.width / size.width, box.height / size.height);
	return { scale, width: size.width * scale, height: size.height * scale };
}

/** A point on the drawing's box on screen, from its top left corner, to drawing units. */
export function toDrawing(view: View, p: Point): Point {
	return view.scale > 0 ? { x: p.x / view.scale, y: p.y / view.scale } : { x: 0, y: 0 };
}

/** The size to flatten at: the photo's own, or smaller to stay under `maxPixels` (a canvas limit), same shape. */
export function flatSize(width: number, height: number, maxPixels: number): Size {
	if (width * height <= maxPixels) return { width, height };
	const k = Math.sqrt(maxPixels / (width * height));
	return { width: Math.floor(width * k), height: Math.floor(height * k) };
}
