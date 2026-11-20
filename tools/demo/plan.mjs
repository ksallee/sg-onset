// The pure parts of the demo video: frame timing, caption spans, the ffmpeg filter graph. No I/O.

/** The square: the app in a rounded frame, the caption above it, the URL below. */
export const LAYOUT = {
	size: 1080,
	app: { x: 40, y: 196, w: 1000, h: 694 },
	radius: 28
};

/** @typedef {{ file: string; t: number }} Shot  a screencast frame and its time in seconds */
/** @typedef {{ t: number; text: string }} Caption  shown from t; empty text hides the one before */
/** @typedef {{ index: number; text: string; a: number; b: number }} Span */

const byTime = (/** @type {Shot[]} */ shots) => [...shots].sort((x, y) => x.t - y.t);

/** Seconds from the first frame to the last, plus the hold on the last. */
export function duration(/** @type {Shot[]} */ shots, tail = 0.5) {
	const s = byTime(shots);
	return s.at(-1).t - s[0].t + tail;
}

/** An ffconcat list: each frame held until the next. The screencast only sends a frame on change. */
export function concatList(/** @type {Shot[]} */ shots, tail = 0.5) {
	const s = byTime(shots);
	const lines = ['ffconcat version 1.0'];
	s.forEach((shot, i) => {
		const d = i + 1 < s.length ? s[i + 1].t - shot.t : tail;
		lines.push(`file '${shot.file}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`);
	});
	lines.push(`file '${s.at(-1).file}'`);
	return lines.join('\n');
}

/** Each caption runs until the next one starts, the last until the end. */
export function captionSpans(/** @type {Caption[]} */ caps, /** @type {number} */ end) {
	/** @type {Span[]} */
	const spans = [];
	caps.forEach((c, i) => {
		if (!c.text) return;
		spans.push({ index: i, text: c.text, a: Math.max(c.t, 0), b: i + 1 < caps.length ? caps[i + 1].t : end });
	});
	return spans;
}

/**
 * The filter graph, one filter per item. Inputs: 0 the frames, 1 the background, 2 the frame mask,
 * 3 the title card, 4 the end card, 5 on the captions in span order.
 * @param {{ spans: Span[]; duration: number; title: number; end: number; xfade: number }} o
 */
export function filterGraph({ spans, duration, title, xfade }) {
	const { app } = LAYOUT;
	const f = [
		`[0:v]fps=30,scale=${app.w}:${app.h}:flags=lanczos,format=rgba[v]`,
		'[2:v]format=gray[m]',
		'[v][m]alphamerge[vr]',
		'[1:v]format=rgba[bg]',
		`[bg][vr]overlay=${app.x}:${app.y}:shortest=1[a0]`
	];
	spans.forEach((s, i) => {
		const fade = Math.min(0.3, (s.b - s.a) / 3).toFixed(3);
		f.push(
			`[${5 + i}:v]format=rgba,fade=t=in:st=${s.a.toFixed(3)}:d=${fade}:alpha=1,fade=t=out:st=${(s.b - Number(fade)).toFixed(3)}:d=${fade}:alpha=1[c${i}]`,
			`[a${i}][c${i}]overlay=0:0:shortest=1[a${i + 1}]`
		);
	});
	const norm = 'fps=30,format=yuv420p,setsar=1';
	f.push(
		`[a${spans.length}]${norm}[main]`,
		`[3:v]${norm}[t]`,
		`[4:v]${norm}[e]`,
		`[t][main]xfade=transition=fade:duration=${xfade}:offset=${(title - xfade).toFixed(3)}[x1]`,
		`[x1][e]xfade=transition=fade:duration=${xfade}:offset=${(title + duration - 2 * xfade).toFixed(3)}[out]`
	);
	return f;
}
