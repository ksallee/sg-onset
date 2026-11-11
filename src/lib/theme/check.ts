// Measures the palette's pairings: each foreground on each surface it sits on, in a scheme. Used
// by palette.test.ts and by the specimen page. Pure.
import { apca, flatten, wcag } from './contrast';
import { PAIRINGS, targetFor, token, valueOf, type Min, type Scheme } from './palette';

/** `rgb(…)`, `#…` or `oklch(L C h)` with its alpha set to `a`. */
function withAlpha(css: string, a: number): string {
	return css.replace(/\s*\/\s*[\d.]+\)$/, ')').replace(/\)$/, ` / ${a})`);
}

/** A surface spec as CSS layers, bottom first: `cell`, `cell>tint-fill`, `cell>good@status-fill`
 * (the colour at the share a raw percentage token gives). */
export function layers(spec: string, scheme: Scheme): string[] {
	return spec.split('>').map((part) => {
		const [name, share] = part.split('@');
		const v = valueOf(token(name), scheme);
		if (!share) return v;
		const pct = parseFloat(valueOf(token(share), scheme)) / 100;
		return withAlpha(v, pct);
	});
}

export interface Measure {
	wcag: number;
	/** APCA Lc, signed: negative is light on dark. */
	apca: number;
}

/** One foreground token on one surface spec. */
export function measure(fg: string, on: string, scheme: Scheme): Measure {
	const bg = flatten(layers(on, scheme));
	const text = valueOf(token(fg), scheme);
	return { wcag: wcag(text, bg), apca: apca(text, bg) };
}

export interface Result extends Measure {
	fg: string;
	on: string;
	min: Min;
	pass: boolean;
	why: string;
}

/** Every pairing with a target in this scheme, measured. */
export function report(scheme: Scheme): Result[] {
	return PAIRINGS.flatMap((p) => {
		const min = targetFor(p, scheme);
		if (!min) return [];
		return p.on.map((on) => {
			const r = measure(p.fg, on, scheme);
			const pass = r.wcag >= min.wcag && Math.abs(r.apca) >= min.apca;
			return { fg: p.fg, on, min, pass, why: p.why, ...r };
		});
	});
}
