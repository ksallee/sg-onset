import { describe, expect, it } from 'vitest';
import { LAYOUT, captionSpans, concatList, duration, filterGraph } from './plan.mjs';

const shots = [
	{ file: '/f/b.jpg', t: 101.5 },
	{ file: '/f/a.jpg', t: 100 },
	{ file: '/f/c.jpg', t: 102 }
];

describe('duration', () => {
	it('runs from the first frame to the last, plus the hold on the last', () => {
		expect(duration(shots, 0.5)).toBeCloseTo(2.5);
	});
});

describe('concatList', () => {
	it('holds each frame until the next, in time order, the last for the tail, then names it again', () => {
		expect(concatList(shots, 0.5).split('\n')).toEqual([
			'ffconcat version 1.0',
			"file '/f/a.jpg'",
			'duration 1.5000',
			"file '/f/b.jpg'",
			'duration 0.5000',
			"file '/f/c.jpg'",
			'duration 0.5000',
			"file '/f/c.jpg'"
		]);
	});

	it('never writes a zero duration for frames with the same time', () => {
		const list = concatList([{ file: '/a', t: 1 }, { file: '/b', t: 1 }], 0.5);
		expect(list).toContain('duration 0.0010');
	});
});

describe('captionSpans', () => {
	const caps = [
		{ t: -0.1, text: 'One' },
		{ t: 5, text: 'Two' },
		{ t: 9, text: '' },
		{ t: 10, text: 'Three' }
	];

	it('runs each caption until the next one, the last until the end; an empty one only ends the one before', () => {
		expect(captionSpans(caps, 12)).toEqual([
			{ index: 0, text: 'One', a: 0, b: 5 },
			{ index: 1, text: 'Two', a: 5, b: 9 },
			{ index: 3, text: 'Three', a: 10, b: 12 }
		]);
	});

	it('is empty with no captions', () => {
		expect(captionSpans([], 12)).toEqual([]);
	});
});

describe('filterGraph', () => {
	const spans = [
		{ index: 0, text: 'One', a: 0, b: 5 },
		{ index: 1, text: 'Two', a: 5, b: 5.3 }
	];
	const graph = filterGraph({ spans, duration: 40, title: 2.6, end: 3.6, xfade: 0.5 });

	it('puts the app in its rounded frame at the layout position', () => {
		expect(graph).toContain(`[0:v]fps=30,scale=${LAYOUT.app.w}:${LAYOUT.app.h}:flags=lanczos,format=rgba[v]`);
		expect(graph).toContain('[v][m]alphamerge[vr]');
		expect(graph).toContain(`[bg][vr]overlay=${LAYOUT.app.x}:${LAYOUT.app.y}:shortest=1[a0]`);
	});

	it('fades each caption in and out within its span, a short span by a third of it', () => {
		expect(graph).toContain('[5:v]format=rgba,fade=t=in:st=0.000:d=0.300:alpha=1,fade=t=out:st=4.700:d=0.300:alpha=1[c0]');
		expect(graph).toContain('[6:v]format=rgba,fade=t=in:st=5.000:d=0.100:alpha=1,fade=t=out:st=5.200:d=0.100:alpha=1[c1]');
		expect(graph).toContain('[a1][c1]overlay=0:0:shortest=1[a2]');
	});

	it('crossfades the title into the app and the app into the end card', () => {
		expect(graph).toContain('[a2]fps=30,format=yuv420p,setsar=1[main]');
		expect(graph).toContain('[t][main]xfade=transition=fade:duration=0.5:offset=2.100[x1]');
		expect(graph).toContain('[x1][e]xfade=transition=fade:duration=0.5:offset=41.600[out]');
	});

	it('the app frame fits the square with room for the caption above and the URL below', () => {
		const { size, app } = LAYOUT;
		expect(app.x * 2 + app.w).toBe(size);
		expect(app.y).toBeGreaterThan(150);
		expect(size - (app.y + app.h)).toBeGreaterThan(150);
		expect(app.w / app.h).toBeCloseTo(1180 / 820, 2);
		expect(app.h % 2).toBe(0);
	});
});
