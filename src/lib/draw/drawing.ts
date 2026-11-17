// A drawing as data: the shapes drawn over a photo (#86) or on a setup diagram (#87). Freehand
// strokes, text, dimension lines with a typed length, and symbols placed and turned. Coordinates
// are in the drawing's own units: a photo's pixels, or the diagram's sheet. Every function returns
// a new value and leaves the one it was given alone. Pure.

import { parseLength, type Length, type UnitSystem } from '$lib/model/length';

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

/**
 * The inks, as the flattened image draws them. On screen they sit in the drawing area, which red
 * night mode greys and tints as it does a photo.
 */
export const INKS = {
	red: '#ff3b30',
	yellow: '#ffcc00',
	blue: '#0a84ff',
	white: '#ffffff',
	black: '#000000'
} as const;
export type Ink = keyof typeof INKS;
export const INK_NAMES = Object.keys(INKS) as Ink[];

/** A freehand line. `points` is flat: x0, y0, x1, y1… */
export type Stroke = { kind: 'stroke'; id: string; ink: Ink; width: number; points: number[] };
/** One line of text, centred on `at`. */
export type TextNote = { kind: 'text'; id: string; ink: Ink; at: Point; size: number; text: string };
/** A line from `a` to `b` with the length the person typed. No value: not measured yet. */
export type Dimension = { kind: 'dimension'; id: string; ink: Ink; a: Point; b: Point; width: number; size: number; value?: Length };

export const SYMBOLS = ['camera', 'subject', 'light', 'marker'] as const;
export type SymbolKind = (typeof SYMBOLS)[number];
/**
 * A symbol placed on the drawing. `rotation` is in degrees, clockwise, 0 facing the top. A camera
 * placed for a camera setup keeps the setup's id: its letter, lens and field of view come from it.
 */
export type Figure = { kind: 'symbol'; id: string; symbol: SymbolKind; ink: Ink; at: Point; rotation: number; size: number; setupId?: string };

export type Shape = Stroke | TextNote | Dimension | Figure;
export type Drawing = Size & { shapes: Shape[] };

const round1 = (n: number) => Math.round(n * 10) / 10 + 0;

/** The pen width, text size and symbol size for a drawing of this size. A tiny photo gets a floor. */
export function styleFor(size: Size): { stroke: number; text: number; symbol: number } {
	const base = Math.max(size.width, size.height, 400);
	return { stroke: round1(base * 0.005), text: round1(base * 0.028), symbol: round1(base * 0.03) };
}

function offLine(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy);
	if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Fewer points for the same line: a point closer than `tolerance` to the line it sits on goes (Ramer–Douglas–Peucker). */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
	if (points.length <= 2) return [...points];
	const first = points[0];
	const last = points[points.length - 1];
	let far = 0;
	let at = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const d = offLine(points[i], first, last);
		if (d > far) {
			far = d;
			at = i;
		}
	}
	if (far <= tolerance) return [first, last];
	return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

/** A stroke from the points the pen went through: simplified to a quarter of its width, to a tenth of a unit. */
export function makeStroke(id: string, points: readonly Point[], ink: Ink, width: number): Stroke {
	const kept = points.length === 1 ? [points[0], points[0]] : simplify(points, width / 4);
	return { kind: 'stroke', id, ink, width, points: kept.flatMap((p) => [round1(p.x), round1(p.y)]) };
}

export function addShape(shapes: readonly Shape[], shape: Shape): Shape[] {
	return [...shapes, shape];
}

/** The list with the shape of the same id replaced, in its place. */
export function replaceShape(shapes: readonly Shape[], shape: Shape): Shape[] {
	return shapes.map((s) => (s.id === shape.id ? shape : s));
}

export function removeShape(shapes: readonly Shape[], id: string): Shape[] {
	return shapes.filter((s) => s.id !== id);
}

const shift = (p: Point, dx: number, dy: number): Point => ({ x: round1(p.x + dx), y: round1(p.y + dy) });

export function moveShape<S extends Shape>(shape: S, dx: number, dy: number): S {
	switch (shape.kind) {
		case 'stroke':
			return { ...shape, points: shape.points.map((v, i) => round1(v + (i % 2 ? dy : dx))) };
		case 'dimension':
			return { ...shape, a: shift(shape.a, dx, dy), b: shift(shape.b, dx, dy) };
		default:
			return { ...shape, at: shift(shape.at, dx, dy) };
	}
}

/** A dimension line with one end moved. */
export function setEnd(shape: Dimension, end: 'a' | 'b', to: Point): Dimension {
	return { ...shape, [end]: { x: round1(to.x), y: round1(to.y) } };
}

/** A symbol turned to `rotation` degrees: whole degrees, from 0 up to 360. */
export function turnShape(shape: Figure, rotation: number): Figure {
	return { ...shape, rotation: ((Math.round(rotation) % 360) + 360) % 360 };
}

/** The text of a text shape, trimmed. Left empty, the shape goes. */
export function setText(shapes: readonly Shape[], id: string, text: string): Shape[] {
	const value = text.trim();
	if (!value) return shapes.filter((s) => !(s.id === id && s.kind === 'text'));
	return shapes.map((s) => (s.id === id && s.kind === 'text' ? { ...s, text: value } : s));
}

/** The typed length of a dimension line. Undefined takes it off. */
export function setValue(shapes: readonly Shape[], id: string, value: Length | undefined): Shape[] {
	return shapes.map((s) => {
		if (s.id !== id || s.kind !== 'dimension') return s;
		const { value: _old, ...rest } = s;
		return value ? { ...rest, value } : rest;
	});
}

/** The list with a text added at `at`, trimmed. An empty text adds nothing. */
export function addText(shapes: readonly Shape[], t: { id: string; at: Point; text: string; ink: Ink; size: number }): Shape[] {
	const text = t.text.trim();
	return text ? [...shapes, { kind: 'text', id: t.id, ink: t.ink, at: t.at, size: t.size, text }] : [...shapes];
}

/**
 * A dimension line's length from what was typed, read as the units setting reads a bare number.
 * Empty is no value. Infinity and a length below zero are not lengths here.
 */
export function readLength(text: string, system: UnitSystem): { ok: true; value?: Length } | { ok: false } {
	if (!text.trim()) return { ok: true };
	const value = parseLength(text, system);
	if (!value || value.m === 'inf' || value.m < 0) return { ok: false };
	return { ok: true, value };
}

/** The point, kept on the drawing. */
export function clampPoint(p: Point, size: Size): Point {
	return { x: Math.min(Math.max(p.x, 0), size.width), y: Math.min(Math.max(p.y, 0), size.height) };
}

export function isBlank(drawing: Drawing | undefined): boolean {
	return !drawing || drawing.shapes.length === 0;
}
