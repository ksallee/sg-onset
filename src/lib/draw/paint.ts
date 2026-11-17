// Paints the shapes of a drawing on a 2D canvas context: what the flattened image is made of. The
// geometry and the order come from geometry.ts, which the screen draws from too. No I/O: the
// context is handed in, so a test can give it a recorder.

import { formatLength, type UnitSystem } from '$lib/model/length';
import { INKS, type Dimension, type Figure, type Ink, type Point, type Shape } from './drawing';
import { dimensionParts, figureLine, figureParts, paintOrder, strokePoints, type Part } from './geometry';
import { fovWedge } from './optics';

/** The part of CanvasRenderingContext2D the painter uses. */
export type Painter = Pick<
	CanvasRenderingContext2D,
	| 'save'
	| 'restore'
	| 'beginPath'
	| 'moveTo'
	| 'lineTo'
	| 'closePath'
	| 'arc'
	| 'stroke'
	| 'fill'
	| 'fillText'
	| 'strokeText'
	| 'translate'
	| 'rotate'
	| 'strokeStyle'
	| 'fillStyle'
	| 'lineWidth'
	| 'lineCap'
	| 'lineJoin'
	| 'font'
	| 'textAlign'
	| 'textBaseline'
	| 'globalAlpha'
>;

/**
 * What the painter cannot know by itself: the words on a dimension line and under a symbol, and
 * the field of view of a camera symbol, drawn as a wedge `reach` units long.
 */
export type Labels = {
	value: (d: Dimension) => string;
	captions?: (f: Figure) => string[];
	fov?: (f: Figure) => number | undefined;
	reach?: number;
};

/** How strong a field of view is: a light fill, its edges a little more. */
export const FOV_FILL = 0.12;
export const FOV_EDGE = 0.5;

/** The camera symbols with a field of view, and the wedge of each. */
export function wedges(shapes: readonly Shape[], labels: Labels): { camera: Figure; points: Point[] }[] {
	const out: { camera: Figure; points: Point[] }[] = [];
	for (const s of shapes) {
		if (s.kind !== 'symbol' || s.symbol !== 'camera') continue;
		const fov = labels.fov?.(s);
		if (fov !== undefined) out.push({ camera: s, points: fovWedge(s, fov, labels.reach ?? s.size * 6) });
	}
	return out;
}

/** The app's type, for text drawn into an image. */
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

/** A dimension line's length in `system`, as the screen shows it. A line with none yet shows "?". */
export function valueText(d: Pick<Dimension, 'value'>, system: UnitSystem): string {
	return d.value ? formatLength(d.value, system) : '?';
}

/** A dimension line's length as it was typed: what the flattened image shows, whatever the setting. */
export function typedText(d: Pick<Dimension, 'value'>): string {
	return d.value ? formatLength(d.value, d.value.entered?.system ?? 'metric') : '?';
}

/** The ring around text, so it reads on any photo: white around black ink, black around the rest. */
export function haloOf(ink: Ink): string {
	return ink === 'black' ? INKS.white : INKS.black;
}

function path(ctx: Painter, part: Part): void {
	ctx.beginPath();
	if (part.kind === 'circle') ctx.arc(part.at.x, part.at.y, part.r, 0, Math.PI * 2);
	else {
		part.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
		if (part.closed) ctx.closePath();
	}
}

function words(ctx: Painter, text: string, x: number, y: number, size: number, ink: Ink, angle = 0): void {
	ctx.save();
	ctx.translate(x, y);
	if (angle) ctx.rotate((angle * Math.PI) / 180);
	ctx.font = `600 ${size}px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineJoin = 'round';
	ctx.lineWidth = size * 0.16;
	ctx.strokeStyle = haloOf(ink);
	ctx.strokeText(text, 0, 0);
	ctx.fillStyle = INKS[ink];
	ctx.fillText(text, 0, 0);
	ctx.restore();
}

function paintShape(ctx: Painter, shape: Shape, labels: Labels): void {
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	switch (shape.kind) {
		case 'stroke': {
			const pts = strokePoints(shape);
			ctx.strokeStyle = INKS[shape.ink];
			ctx.lineWidth = shape.width;
			ctx.beginPath();
			pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
			ctx.stroke();
			return;
		}
		case 'dimension': {
			const parts = dimensionParts(shape);
			ctx.strokeStyle = INKS[shape.ink];
			ctx.lineWidth = shape.width;
			ctx.beginPath();
			ctx.moveTo(shape.a.x, shape.a.y);
			ctx.lineTo(shape.b.x, shape.b.y);
			for (const [p, q] of parts.ticks) {
				ctx.moveTo(p.x, p.y);
				ctx.lineTo(q.x, q.y);
			}
			ctx.stroke();
			words(ctx, labels.value(shape), parts.label.at.x, parts.label.at.y, shape.size, shape.ink, parts.label.angle);
			return;
		}
		case 'symbol': {
			ctx.strokeStyle = INKS[shape.ink];
			ctx.fillStyle = INKS[shape.ink];
			ctx.lineWidth = figureLine(shape);
			for (const part of figureParts(shape)) {
				path(ctx, part);
				if (part.fill) ctx.fill();
				ctx.stroke();
			}
			const size = shape.size * 0.45;
			(labels.captions?.(shape) ?? []).forEach((line, i) => words(ctx, line, shape.at.x, shape.at.y + shape.size * 1.05 + i * size * 1.2, size, shape.ink));
			return;
		}
		case 'text':
			words(ctx, shape.text, shape.at.x, shape.at.y, shape.size, shape.ink);
			return;
	}
}

/**
 * Paints the shapes, in drawing units: scale the context first to paint at another size. The
 * fields of view first, under everything, then the shapes in paint order.
 */
export function paint(ctx: Painter, shapes: readonly Shape[], labels: Labels): void {
	for (const { camera, points } of wedges(shapes, labels)) {
		ctx.save();
		ctx.beginPath();
		points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
		ctx.closePath();
		ctx.globalAlpha = FOV_FILL;
		ctx.fillStyle = INKS[camera.ink];
		ctx.fill();
		ctx.globalAlpha = FOV_EDGE;
		ctx.strokeStyle = INKS[camera.ink];
		ctx.lineWidth = figureLine(camera) * 0.75;
		ctx.stroke();
		ctx.restore();
	}
	for (const shape of paintOrder(shapes)) paintShape(ctx, shape, labels);
}
