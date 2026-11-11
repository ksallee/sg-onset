// Colour maths for the theme: read a CSS colour, lay translucent layers over opaque ones, and
// measure contrast two ways: WCAG 2 (the legal floor) and APCA W3 0.0.98G-4g (what the dark and
// red modes are judged by: WCAG 2 overstates contrast for dark colours). Pure.

export interface RGB {
	r: number;
	g: number;
	b: number;
}
export interface RGBA extends RGB {
	a: number;
}

/** OKLCH (L 0–1, C, h in degrees) to gamma-encoded sRGB, unclamped. */
export function oklchToSrgb(l: number, c: number, h: number): RGB {
	const rad = (h * Math.PI) / 180;
	const a = c * Math.cos(rad);
	const b = c * Math.sin(rad);
	const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const lin = {
		r: 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
		g: -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
		b: -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
	};
	const enc = (x: number) => {
		const s = Math.sign(x);
		const v = Math.abs(x);
		return s * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
	};
	return { r: enc(lin.r), g: enc(lin.g), b: enc(lin.b) };
}

/** Whether a colour sits inside sRGB, with a small tolerance for rounding. */
export function inGamut(c: RGB, eps = 0.002): boolean {
	return [c.r, c.g, c.b].every((v) => v >= -eps && v <= 1 + eps);
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const num = (s: string, pct = 1) => (s.endsWith('%') ? (parseFloat(s) / 100) * pct : parseFloat(s));

/** Reads `#rgb`, `#rrggbb(aa)`, `rgb(r g b / a)` and `oklch(L C h / a)`. Throws on anything else. */
export function parseColor(css: string): RGBA {
	const s = css.trim().toLowerCase();
	const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
	if (hex) {
		let h = hex[1];
		if (h.length === 3) h = [...h].map((x) => x + x).join('');
		const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
		return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? v(6) : 1 };
	}
	const fn = s.match(/^(rgb|oklch)\(\s*([^)]+)\)$/);
	if (fn) {
		const [main, alpha] = fn[2].split('/').map((x) => x.trim());
		const parts = main.split(/[\s,]+/);
		const a = alpha === undefined ? 1 : num(alpha);
		if (parts.length === 3) {
			if (fn[1] === 'rgb') {
				const [r, g, b] = parts.map((p) => num(p, 255) / 255);
				return { r, g, b, a };
			}
			const c = oklchToSrgb(num(parts[0]), num(parts[1], 0.4), num(parts[2]));
			return { r: clamp(c.r), g: clamp(c.g), b: clamp(c.b), a };
		}
	}
	throw new Error(`Cannot read the colour "${css}"`);
}

const toRGBA = (c: string | RGBA | RGB): RGBA =>
	typeof c === 'string' ? parseColor(c) : { a: 1, ...c };

/** `fg` laid over the opaque `bg`, as a browser blends it (in gamma-encoded sRGB). */
export function composite(fg: RGBA, bg: RGB): RGB {
	return {
		r: fg.r * fg.a + bg.r * (1 - fg.a),
		g: fg.g * fg.a + bg.g * (1 - fg.a),
		b: fg.b * fg.a + bg.b * (1 - fg.a)
	};
}

/** A stack of layers, bottom first, flattened to one colour. The bottom must be opaque. */
export function flatten(stack: (string | RGBA)[]): RGB {
	const [bottom, ...rest] = stack.map(toRGBA);
	if (!bottom || bottom.a < 1) throw new Error('The bottom layer must be opaque');
	return rest.reduce<RGB>((acc, layer) => composite(layer, acc), bottom);
}

/** WCAG 2 relative luminance. */
export function luminance(c: RGB): number {
	const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function pair(text: string | RGBA | RGB, bg: string | RGBA | RGB): [RGB, RGB] {
	const b = flatten([toRGBA(bg)]);
	return [composite(toRGBA(text), b), b];
}

/** WCAG 2 contrast ratio, 1 to 21. Translucent text is laid over the background first. */
export function wcag(text: string | RGBA | RGB, bg: string | RGBA | RGB): number {
	const [t, b] = pair(text, bg);
	const [hi, lo] = [luminance(t), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** APCA lightness contrast Lc (W3 0.0.98G-4g): positive for dark on light, negative for light on dark. */
export function apca(text: string | RGBA | RGB, bg: string | RGBA | RGB): number {
	const [t, b] = pair(text, bg);
	const y = (c: RGB) => 0.2126729 * clamp(c.r) ** 2.4 + 0.7151522 * clamp(c.g) ** 2.4 + 0.072175 * clamp(c.b) ** 2.4;
	const soft = (v: number) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
	const yt = soft(y(t));
	const yb = soft(y(b));
	if (Math.abs(yb - yt) < 0.0005) return 0;
	if (yb > yt) {
		const sapc = (yb ** 0.56 - yt ** 0.57) * 1.14;
		return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
	}
	const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14;
	return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}
