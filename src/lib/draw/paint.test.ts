import { describe, expect, it } from 'vitest';
import { parseLength } from '$lib/model/length';
import type { Dimension, Figure, Shape, Stroke, TextNote } from './drawing';
import { haloOf, paint, typedText, valueText, type Painter } from './paint';

/** A 2D context that writes down what it is asked to do. */
function recorder(): Painter & { log: string[] } {
	const log: string[] = [];
	const state: Record<string, unknown> = {};
	const fn =
		(name: string) =>
		(...args: unknown[]) =>
			log.push(`${name}(${args.map((a) => (typeof a === 'number' ? Math.round(a) : String(a))).join(',')})`);
	return new Proxy(
		{ log },
		{
			get(target, key: string) {
				if (key === 'log') return target.log;
				if (key in state) return state[key];
				return fn(key);
			},
			set(_t, key: string, value) {
				state[key] = value;
				log.push(`${key}=${value}`);
				return true;
			}
		}
	) as unknown as Painter & { log: string[] };
}

const stroke: Stroke = { kind: 'stroke', id: 's', ink: 'red', width: 8, points: [0, 0, 10, 0, 20, 5] };
const text: TextNote = { kind: 'text', id: 't', ink: 'yellow', at: { x: 50, y: 50 }, size: 20, text: 'Tracker' };
const dim: Dimension = { kind: 'dimension', id: 'd', ink: 'white', a: { x: 0, y: 100 }, b: { x: 100, y: 100 }, width: 4, size: 20, value: parseLength("6' 3\"", 'imperial')! };
const fig: Figure = { kind: 'symbol', id: 'f', symbol: 'marker', ink: 'black', at: { x: 200, y: 200 }, rotation: 0, size: 40 };

describe('valueText and typedText', () => {
	it('shows a length in the units asked, or as typed', () => {
		expect(valueText(dim, 'imperial')).toBe('6\' 3"');
		expect(valueText(dim, 'metric')).toBe('1.905 m');
		expect(typedText(dim)).toBe('6\' 3"');
	});
	it('shows a question mark on a line with no value yet', () => {
		const { value: _v, ...rest } = dim;
		const bare: Dimension = rest;
		expect(valueText(bare, 'metric')).toBe('?');
		expect(typedText(bare)).toBe('?');
	});
});

describe('haloOf', () => {
	it('rings dark ink in white and every other ink in black', () => {
		expect(haloOf('black')).toBe('#ffffff');
		expect(haloOf('yellow')).toBe('#000000');
	});
});

describe('paint', () => {
	it('paints in paint order: the stroke first, the text last', () => {
		const ctx = recorder();
		const shapes: Shape[] = [text, fig, dim, stroke];
		paint(ctx, shapes, { value: typedText });
		const first = (needle: string) => ctx.log.findIndex((l) => l.includes(needle));
		expect(first('strokeStyle=#ff3b30')).toBeGreaterThan(-1);
		expect(first('strokeStyle=#ff3b30')).toBeLessThan(first('fillText(6\' 3"'));
		expect(first('fillText(6\' 3"')).toBeLessThan(first('fillText(Tracker'));
	});
	it('rings text with its halo before it fills it', () => {
		const ctx = recorder();
		paint(ctx, [text], { value: typedText });
		expect(ctx.log.findIndex((l) => l.startsWith('strokeText(Tracker'))).toBeLessThan(ctx.log.findIndex((l) => l.startsWith('fillText(Tracker')));
	});
	it('writes the captions of a symbol under it', () => {
		const ctx = recorder();
		paint(ctx, [fig], { value: typedText, captions: () => ['A', '35 mm'] });
		expect(ctx.log.some((l) => l.startsWith('fillText(A,'))).toBe(true);
		expect(ctx.log.some((l) => l.startsWith('fillText(35 mm,'))).toBe(true);
	});
});
