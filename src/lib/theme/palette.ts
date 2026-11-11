// The colour and material tokens: the one source of truth. tokens.css is generated from this
// (css.ts), and palette.test.ts checks every pairing below in every mode. Pure data.
//
// Three modes: light (built for direct sunlight), dark (built for a dim stage) and night (red on
// black for a dark set: only the red channel ever lights). Each has an increased-contrast
// variant (`more`) for iPadOS Increase Contrast. See docs/design/colour.md for the reasons.
// Imports carry `.ts` so `node scripts/theme-tokens.mjs` runs without a bundler.
import { inGamut, oklchToSrgb } from './contrast.ts';

export const MODES = ['light', 'dark', 'night'] as const;
export type Mode = (typeof MODES)[number];
export type Scheme = Mode | `${Mode}-more`;
export const SCHEMES: readonly Scheme[] = ['light', 'dark', 'night', 'light-more', 'dark-more', 'night-more'];

export type Group =
	| 'background'
	| 'label'
	| 'separator'
	| 'fill'
	| 'tint'
	| 'status'
	| 'focus'
	| 'material'
	| 'elevation'
	| 'keypad'
	| 'rail';

export interface Token {
	/** The custom property, without the `--`. */
	name: string;
	group: Group;
	/** What it is for, in a few words. */
	use: string;
	/** `raw` values (shadows) are written as they are and not measured. */
	raw?: boolean;
	light: string;
	dark: string;
	night: string;
	/** Increased contrast: only the values that change. */
	more?: Partial<Record<Mode, string>>;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** An OKLCH colour as CSS. Chroma is cut to the most sRGB holds at that lightness and hue, so
 * every token renders the same on any screen (iPads are P3; a P3-only red would read differently
 * in a screenshot or an export). */
export function ok(l: number, c: number, h: number, a?: number): string {
	if (!inGamut(oklchToSrgb(l, c, h), 0)) {
		let [lo, hi] = [0, c];
		for (let i = 0; i < 24; i++) {
			const mid = (lo + hi) / 2;
			if (inGamut(oklchToSrgb(l, mid, h), 0)) lo = mid;
			else hi = mid;
		}
		c = Math.floor(lo * 10000) / 10000;
	}
	return `oklch(${r4(l)} ${r4(c)} ${r4(h)}${a === undefined ? '' : ` / ${r4(a)}`})`;
}

/** Night's only hue: pure sRGB red (no green, no blue) at OKLab lightness `l` (0 to 0.627). In
 * OKLab pure red keeps one hue and a fixed chroma to lightness ratio, so this walks rgb(k 0 0). */
export function red(l: number, a?: number): string {
	return ok(l, l * 0.41034, 29.234, a);
}

/** The neutral hue: a cool grey, barely tinted. */
const N = 268;
const n = (l: number, a?: number, c = 0.004) => ok(l, c, N, a);

/** The accent: one blue. */
const T = 262;

const BLACK = 'oklch(0 0 0)';
const WHITE = 'oklch(1 0 0)';

export const TOKENS: readonly Token[] = [
	// ---------------------------------------------------------------- backgrounds
	{
		name: 'bg',
		group: 'background',
		use: 'The canvas: behind grouped lists and columns',
		light: n(0.947, undefined, 0.006),
		dark: n(0.145, undefined, 0.002),
		night: BLACK,
		more: { light: n(0.925, undefined, 0.006), dark: BLACK }
	},
	{
		name: 'bg-elevated',
		group: 'background',
		use: 'A sheet, popover or panel above the canvas',
		light: n(0.972, undefined, 0.003),
		dark: n(0.215, undefined, 0.004),
		night: red(0.08),
		more: { light: n(0.96, undefined, 0.004), dark: n(0.25, undefined, 0.004) }
	},
	{
		name: 'sidebar',
		group: 'background',
		use: 'The list column and sidebars',
		light: n(0.962, undefined, 0.005),
		dark: n(0.18, undefined, 0.003),
		night: red(0.05),
		more: { light: n(0.945, undefined, 0.005), dark: n(0.12, undefined, 0.002) }
	},
	{
		name: 'cell',
		group: 'background',
		use: 'A row or card on the canvas',
		light: WHITE,
		dark: n(0.22, undefined, 0.004),
		night: red(0.09),
		more: { dark: n(0.255, undefined, 0.004) }
	},
	{
		name: 'cell-ring',
		group: 'background',
		use: 'An outline round grouped cells: on with Increase Contrast only',
		raw: true,
		light: '0px',
		dark: '0px',
		night: '0px',
		more: { light: '1px', dark: '1px', night: '1px' }
	},
	{
		name: 'cell-elevated',
		group: 'background',
		use: 'A row or card on an elevated surface',
		light: WHITE,
		dark: n(0.275, undefined, 0.005),
		night: red(0.11),
		more: { dark: n(0.31, undefined, 0.005) }
	},

	// ---------------------------------------------------------------- labels
	{
		name: 'label',
		group: 'label',
		use: 'Primary text and icons',
		light: n(0.165, undefined, 0.008),
		dark: n(0.955, undefined, 0.003),
		night: red(0.61),
		more: { light: BLACK, dark: WHITE, night: red(0.627) }
	},
	{
		name: 'label-2',
		group: 'label',
		use: 'Secondary text: details, captions',
		light: n(0.25, 0.79, 0.016),
		dark: n(0.93, 0.75, 0.008),
		night: red(0.53),
		more: { light: n(0.2, 0.9, 0.016), dark: n(0.95, 0.84, 0.006), night: red(0.61) }
	},
	{
		name: 'label-3',
		group: 'label',
		use: 'Tertiary text: placeholders, disabled',
		light: n(0.25, 0.6, 0.016),
		dark: n(0.93, 0.53, 0.008),
		night: red(0.42),
		more: { light: n(0.2, 0.7, 0.016), dark: n(0.95, 0.62, 0.006), night: red(0.5) }
	},
	{
		name: 'label-4',
		group: 'label',
		use: 'Quaternary: watermarks, never text to read',
		light: n(0.25, 0.22, 0.016),
		dark: n(0.93, 0.18, 0.008),
		night: red(0.3),
		more: { light: n(0.2, 0.34, 0.016), dark: n(0.95, 0.3, 0.006), night: red(0.38) }
	},

	// ---------------------------------------------------------------- separators
	{
		name: 'separator',
		group: 'separator',
		use: 'Hairlines between rows, over any surface',
		light: n(0.3, 0.3, 0.016),
		dark: n(0.6, 0.36, 0.01),
		night: red(0.5, 0.36),
		more: { light: n(0.25, 0.58, 0.016), dark: n(0.7, 0.62, 0.01), night: red(0.55, 0.62) }
	},
	{
		name: 'separator-opaque',
		group: 'separator',
		use: 'A hairline where nothing may show through',
		light: n(0.84, undefined, 0.006),
		dark: n(0.34, undefined, 0.005),
		night: red(0.27),
		more: { light: n(0.66, undefined, 0.008), dark: n(0.5, undefined, 0.006), night: red(0.38) }
	},

	// ---------------------------------------------------------------- fills
	{
		name: 'fill',
		group: 'fill',
		use: 'Thin controls: slider track, switch off, capture face',
		light: n(0.56, 0.22, 0.012),
		dark: n(0.6, 0.38, 0.012),
		night: red(0.5, 0.3),
		more: { light: n(0.5, 0.3, 0.012), dark: n(0.65, 0.48, 0.012), night: red(0.55, 0.3) }
	},
	{
		name: 'fill-2',
		group: 'fill',
		use: 'Medium controls: gray buttons, rail buttons',
		light: n(0.56, 0.17, 0.012),
		dark: n(0.6, 0.31, 0.012),
		night: red(0.5, 0.16),
		more: { light: n(0.5, 0.24, 0.012), dark: n(0.65, 0.4, 0.012), night: red(0.55, 0.22) }
	},
	{
		name: 'fill-3',
		group: 'fill',
		use: 'Large shapes: search field, chips, keypad alt keys',
		light: n(0.56, 0.12, 0.012),
		dark: n(0.6, 0.24, 0.012),
		night: red(0.5, 0.13),
		more: { light: n(0.5, 0.18, 0.012), dark: n(0.65, 0.32, 0.012), night: red(0.55, 0.18) }
	},
	{
		name: 'fill-4',
		group: 'fill',
		use: 'Very large shapes: table stripes, wells',
		light: n(0.56, 0.07, 0.012),
		dark: n(0.6, 0.16, 0.012),
		night: red(0.5, 0.12),
		more: { light: n(0.5, 0.12, 0.012), dark: n(0.65, 0.22, 0.012), night: red(0.55, 0.18) }
	},
	{
		name: 'press',
		group: 'fill',
		use: 'The flash on a pressed row',
		light: ok(0, 0, 0, 0.07),
		dark: ok(1, 0, 0, 0.1),
		night: red(0.5, 0.22)
	},

	// ---------------------------------------------------------------- tint
	{
		name: 'tint',
		group: 'tint',
		use: 'The accent: links, selection, controls that are on',
		light: ok(0.42, 0.17, T),
		dark: ok(0.78, 0.11, T - 3),
		night: red(0.61),
		more: { light: ok(0.37, 0.16, T), dark: ok(0.83, 0.08, T - 3), night: red(0.627) }
	},
	{
		name: 'tint-pressed',
		group: 'tint',
		use: 'The accent under a finger',
		light: ok(0.36, 0.16, T),
		dark: ok(0.7, 0.13, T - 3),
		night: red(0.59),
		more: { light: ok(0.32, 0.14, T), dark: ok(0.76, 0.11, T - 3), night: red(0.6) }
	},
	{
		name: 'tint-disabled',
		group: 'tint',
		use: 'The accent on a control that is off',
		light: ok(0.42, 0.17, T, 0.36),
		dark: ok(0.78, 0.11, T - 3, 0.36),
		night: red(0.61, 0.4),
		more: { light: ok(0.37, 0.16, T, 0.5), dark: ok(0.83, 0.08, T - 3, 0.5), night: red(0.628, 0.55) }
	},
	{
		name: 'tint-fill',
		group: 'tint',
		use: 'Tinted button and selected chip background',
		light: ok(0.42, 0.17, T, 0.1),
		dark: ok(0.78, 0.11, T - 3, 0.1),
		night: red(0.5, 0.15),
		more: { light: ok(0.37, 0.16, T, 0.12), dark: ok(0.83, 0.08, T - 3, 0.12), night: red(0.5, 0.08) }
	},
	{
		name: 'on-tint',
		group: 'tint',
		use: 'Text on a solid tint',
		light: WHITE,
		dark: ok(0.2, 0.05, T),
		night: BLACK,
		more: { dark: ok(0.14, 0.04, T) }
	},
	{
		name: 'tint-solid',
		group: 'tint',
		use: 'Large tint fills: filled buttons, a switch that is on, badges',
		light: ok(0.42, 0.17, T),
		dark: ok(0.56, 0.16, T),
		night: red(0.2),
		more: { light: ok(0.37, 0.16, T), night: red(0.18) }
	},
	{
		name: 'on-tint-solid',
		group: 'tint',
		use: 'Text and knobs on a solid tint',
		light: WHITE,
		dark: WHITE,
		night: red(0.627)
	},
	{
		name: 'state-ring',
		group: 'tint',
		use: 'An outline on a control that is on or pressed: night fills nothing brightly, so shape carries it',
		raw: true,
		light: '0px',
		dark: '0px',
		night: '2px',
		more: { light: '0px', dark: '0px', night: '2.5px' }
	},
	{
		name: 'selection',
		group: 'tint',
		use: 'A selected row or text selection',
		light: ok(0.42, 0.17, T, 0.11),
		dark: ok(0.78, 0.11, T - 3, 0.24),
		night: red(0.5, 0.15),
		more: { light: ok(0.37, 0.16, T, 0.16), dark: ok(0.83, 0.08, T - 3, 0.16), night: red(0.55, 0.12) }
	},

	// ---------------------------------------------------------------- status
	{
		name: 'record',
		group: 'status',
		use: 'The Record disc and the rolling bar: owns red',
		light: ok(0.585, 0.228, 27),
		dark: ok(0.655, 0.222, 26),
		night: red(0.627),
		more: { light: ok(0.53, 0.21, 27) }
	},
	{
		name: 'on-record',
		group: 'status',
		use: 'Text on the record red',
		light: WHITE,
		dark: WHITE,
		night: BLACK
	},
	{
		name: 'rolling',
		group: 'status',
		use: 'Rolling, as text: the clock, the word',
		light: ok(0.53, 0.205, 27),
		dark: ok(0.755, 0.155, 24),
		night: red(0.61),
		more: { light: ok(0.46, 0.18, 27), dark: ok(0.8, 0.13, 22), night: red(0.627) }
	},
	{
		name: 'destructive',
		group: 'status',
		use: 'Delete and other undoable losses, as text',
		light: ok(0.53, 0.205, 27),
		dark: ok(0.755, 0.155, 24),
		night: red(0.61),
		more: { light: ok(0.46, 0.18, 27), dark: ok(0.8, 0.13, 22), night: red(0.627) }
	},
	{
		name: 'destructive-solid',
		group: 'status',
		use: 'A filled destructive button or swipe action',
		light: ok(0.53, 0.205, 27),
		dark: ok(0.54, 0.19, 27),
		night: red(0.16),
		more: { light: ok(0.46, 0.18, 27), dark: ok(0.48, 0.17, 27) }
	},
	{
		name: 'on-destructive',
		group: 'status',
		use: 'Text on a filled destructive button',
		light: WHITE,
		dark: WHITE,
		night: red(0.627)
	},
	{
		name: 'good',
		group: 'status',
		use: 'A circled (good) take',
		light: ok(0.5, 0.13, 150),
		dark: ok(0.77, 0.16, 150),
		night: red(0.61),
		more: { light: ok(0.43, 0.115, 150), dark: ok(0.84, 0.14, 150), night: red(0.627) }
	},
	{
		name: 'no-good',
		group: 'status',
		use: 'A no-good take: grey and struck, never red',
		light: n(0.5, undefined, 0.01),
		dark: n(0.74, undefined, 0.008),
		night: red(0.53),
		more: { light: n(0.42, undefined, 0.01), dark: n(0.78, undefined, 0.006), night: red(0.6) }
	},
	{
		name: 'warning',
		group: 'status',
		use: 'Needs attention: storage low, a check failed',
		light: ok(0.53, 0.12, 62),
		dark: ok(0.82, 0.15, 75),
		night: red(0.61),
		more: { light: ok(0.45, 0.1, 60), dark: ok(0.87, 0.13, 80), night: red(0.627) }
	},
	{
		name: 'changed',
		group: 'status',
		use: 'A field that differs from the last take',
		light: ok(0.53, 0.12, 62),
		dark: ok(0.82, 0.15, 75),
		night: red(0.61),
		more: { light: ok(0.45, 0.1, 60), dark: ok(0.87, 0.13, 80), night: red(0.627) }
	},
	{
		name: 'unsynced',
		group: 'status',
		use: 'Saved on this iPad, not yet in Flow PT',
		light: ok(0.53, 0.12, 62),
		dark: ok(0.82, 0.15, 75),
		night: red(0.53),
		more: { light: ok(0.45, 0.1, 60), dark: ok(0.87, 0.13, 80), night: red(0.6) }
	},
	{
		name: 'synced',
		group: 'status',
		use: 'In Flow PT',
		light: ok(0.5, 0.13, 150),
		dark: ok(0.77, 0.16, 150),
		night: red(0.53),
		more: { light: ok(0.43, 0.115, 150), dark: ok(0.84, 0.14, 150), night: red(0.6) }
	},
	{
		name: 'conflict',
		group: 'status',
		use: 'Changed here and in Flow PT: needs a choice',
		light: ok(0.5, 0.2, 328),
		dark: ok(0.79, 0.13, 330),
		night: red(0.61),
		more: { light: ok(0.43, 0.18, 328), dark: ok(0.83, 0.12, 330), night: red(0.627) }
	},
	{
		name: 'status-fill',
		group: 'status',
		use: 'Behind a status chip: the status colour at this share',
		raw: true,
		light: '12%',
		dark: '18%',
		night: '0%',
		more: { light: '10%', dark: '14%' }
	},
	{
		name: 'status-ring',
		group: 'status',
		use: 'An outline round a status chip, in its colour: night has no fills, so shape carries it',
		raw: true,
		light: '0px',
		dark: '0px',
		night: '1.5px',
		more: { light: '1px', dark: '1px', night: '2px' }
	},

	// ---------------------------------------------------------------- focus
	{
		name: 'focus',
		group: 'focus',
		use: 'The keyboard focus ring',
		light: ok(0.42, 0.17, T),
		dark: ok(0.78, 0.11, T - 3),
		night: red(0.61),
		more: { light: ok(0.37, 0.16, T), dark: ok(0.83, 0.08, T - 3), night: red(0.627) }
	},

	// ---------------------------------------------------------------- materials
	{
		name: 'mat-bar',
		group: 'material',
		use: 'Nav bar, toolbar, tab bar: translucent',
		light: n(0.975, 0.84, 0.003),
		dark: n(0.19, 0.84, 0.003),
		night: ok(0, 0, 0, 0.9),
		more: { light: n(0.975, 0.97, 0.003), dark: n(0.19, 0.97, 0.003), night: BLACK }
	},
	{
		name: 'mat-bar-solid',
		group: 'material',
		use: 'The bar with Reduce Transparency',
		light: n(0.975, undefined, 0.003),
		dark: n(0.19, undefined, 0.003),
		night: BLACK
	},
	{
		name: 'mat-sheet',
		group: 'material',
		use: 'A sheet or menu: translucent',
		light: n(0.972, 0.9, 0.003),
		dark: n(0.215, 0.9, 0.004),
		night: red(0.1, 0.94),
		more: { light: n(0.96, 0.98, 0.004), dark: n(0.25, 0.98, 0.004), night: red(0.1) }
	},
	{
		name: 'mat-sheet-solid',
		group: 'material',
		use: 'The sheet with Reduce Transparency',
		light: n(0.972, undefined, 0.003),
		dark: n(0.215, undefined, 0.004),
		night: red(0.1),
		more: { light: n(0.96, undefined, 0.004), dark: n(0.25, undefined, 0.004) }
	},
	{
		name: 'thumb',
		group: 'material',
		use: 'Switch and slider knobs',
		light: WHITE,
		dark: WHITE,
		night: red(0.5)
	},
	{
		name: 'segment-thumb',
		group: 'material',
		use: 'The selected segment',
		light: WHITE,
		dark: n(0.42, undefined, 0.006),
		night: red(0.27),
		more: { dark: n(0.47, undefined, 0.006), night: red(0.32) }
	},
	{
		name: 'scrim',
		group: 'material',
		use: 'Dims what is under a sheet',
		light: ok(0.15, 0.01, N, 0.3),
		dark: ok(0, 0, 0, 0.5),
		night: ok(0, 0, 0, 0.7)
	},

	// ---------------------------------------------------------------- elevation
	{
		name: 'shadow-1',
		group: 'elevation',
		use: 'Raised a little: keys, knobs, the segment thumb',
		raw: true,
		light: `0 1px 0 ${n(0.2, 0.1, 0.02)}, 0 1px 3px ${n(0.2, 0.08, 0.02)}`,
		dark: `0 1px 0 ${ok(0, 0, 0, 0.55)}`,
		night: 'none'
	},
	{
		name: 'shadow-2',
		group: 'elevation',
		use: 'Floating: menus, popovers, the undo notice',
		raw: true,
		light: `0 0 0 0.5px ${n(0.2, 0.08, 0.02)}, 0 8px 28px ${n(0.2, 0.14, 0.02)}`,
		dark: `0 0 0 0.5px ${ok(1, 0, 0, 0.1)}, 0 12px 36px ${ok(0, 0, 0, 0.6)}`,
		night: `0 0 0 1px ${red(0.27)}`
	},
	{
		name: 'shadow-3',
		group: 'elevation',
		use: 'Over everything: sheets',
		raw: true,
		light: `0 0 0 0.5px ${n(0.2, 0.06, 0.02)}, 0 -6px 40px ${n(0.2, 0.16, 0.02)}`,
		dark: `0 0 0 0.5px ${ok(1, 0, 0, 0.08)}, 0 -10px 48px ${ok(0, 0, 0, 0.7)}`,
		night: `0 0 0 1px ${red(0.27)}`
	},

	// ---------------------------------------------------------------- keypad
	{
		name: 'key',
		group: 'keypad',
		use: 'A digit key',
		light: WHITE,
		dark: n(0.33, undefined, 0.005),
		night: red(0.11),
		more: { dark: n(0.37, undefined, 0.005), night: red(0.13) }
	},
	{
		name: 'key-alt',
		group: 'keypad',
		use: 'The point and delete keys',
		light: n(0.9, undefined, 0.008),
		dark: n(0.25, undefined, 0.004),
		night: red(0.06),
		more: { light: n(0.87, undefined, 0.008), dark: n(0.27, undefined, 0.004) }
	},
	{
		name: 'key-pressed',
		group: 'keypad',
		use: 'A key under a finger: it inverts',
		light: n(0.165, undefined, 0.008),
		dark: n(0.84, undefined, 0.004),
		night: red(0.25),
		more: { light: BLACK, dark: WHITE }
	},
	{
		name: 'key-label',
		group: 'keypad',
		use: 'Digits on a key',
		light: n(0.165, undefined, 0.008),
		dark: n(0.955, undefined, 0.003),
		night: red(0.61),
		more: { light: BLACK, dark: WHITE, night: red(0.627) }
	},
	{
		name: 'key-pressed-label',
		group: 'keypad',
		use: 'The digit on a pressed key',
		light: WHITE,
		dark: BLACK,
		night: red(0.627)
	},

	// ---------------------------------------------------------------- rail
	{
		name: 'rail',
		group: 'rail',
		use: 'The action rail: the darkest, stillest strip',
		light: WHITE,
		dark: BLACK,
		night: BLACK
	},
	{
		name: 'rail-button',
		group: 'rail',
		use: 'A rail button face',
		light: n(0.56, 0.14, 0.012),
		dark: n(0.6, 0.27, 0.012),
		night: red(0.5, 0.16),
		more: { light: n(0.5, 0.2, 0.012), dark: n(0.65, 0.36, 0.012), night: red(0.55, 0.2) }
	},
	{
		name: 'rail-pressed',
		group: 'rail',
		use: 'A rail button that is pressed or on',
		light: n(0.165, undefined, 0.008),
		dark: n(0.84, undefined, 0.004),
		night: red(0.2),
		more: { light: BLACK, dark: WHITE, night: red(0.18) }
	},
	{
		name: 'rail-pressed-label',
		group: 'rail',
		use: 'The icon on a pressed rail button',
		light: WHITE,
		dark: BLACK,
		night: red(0.627)
	},
	{
		name: 'record-ring',
		group: 'rail',
		use: 'The ring round Record while idle',
		light: n(0.165, undefined, 0.008),
		dark: n(0.955, undefined, 0.003),
		night: red(0.53),
		more: { light: BLACK, dark: WHITE, night: red(0.58) }
	}
];

/** The token's value in a scheme. */
export function valueOf(token: Token, scheme: Scheme): string {
	const [mode, more] = scheme.split('-') as [Mode, string | undefined];
	return (more && token.more?.[mode]) || token[mode];
}

export function token(name: string): Token {
	const t = TOKENS.find((x) => x.name === name);
	if (!t) throw new Error(`No token --${name}`);
	return t;
}

// ---------------------------------------------------------------- pairings and targets

/** A minimum: WCAG 2 ratio and APCA |Lc|. */
export interface Min {
	wcag: number;
	apca: number;
}

export interface Pairing {
	/** The foreground token. */
	fg: string;
	/** Surfaces it sits on: a token, or a stack bottom first (`cell>tint-fill`). */
	on: string[];
	/** Targets per scheme; a `-more` scheme falls back to its mode's when not given. */
	min: Partial<Record<Scheme, Min>>;
	/** Why this target. */
	why: string;
}

const m = (wcag: number, apca: number): Min => ({ wcag, apca });

const OPAQUE = ['bg', 'bg-elevated', 'sidebar', 'cell', 'cell-elevated', 'mat-bar-solid', 'mat-sheet-solid', 'rail'];
const CONTENT = ['bg', 'bg-elevated', 'sidebar', 'cell', 'cell-elevated'];

/** Body text: sunlight wants 7:1 and Lc 90; a dim stage Lc 75; night is capped by red (5.25:1 at most). */
const BODY = { light: m(7, 90), dark: m(7, 75), night: m(4.5, 33), 'light-more': m(12, 84), 'dark-more': m(7, 85), 'night-more': m(4.5, 35) };
/** Secondary text: still read in the sun at 7:1. */
const SECONDARY = { light: m(7, 75), dark: m(4.5, 55), night: m(3, 22), 'light-more': m(9, 80), 'dark-more': m(7, 65), 'night-more': m(4.5, 33) };
/** Tertiary: placeholders and disabled text, APCA's floor for any text. */
const TERTIARY = { light: m(3.5, 45), dark: m(3, 30), night: m(2, 12), 'light-more': m(4.5, 55), 'dark-more': m(4.5, 40), 'night-more': m(3, 20) };
/** Accent and status text: AA body text everywhere; 7:1 in the sun for the accent. */
const ACCENT = { light: m(7, 75), dark: m(7, 55), night: m(4.5, 33), 'light-more': m(8, 78), 'dark-more': m(7, 60), 'night-more': m(5, 35) };
const STATUS = { light: m(4.5, 60), dark: m(4.5, 50), night: m(3, 22), 'light-more': m(6, 70), 'dark-more': m(6, 55), 'night-more': m(4.5, 33) };
/** Shapes that must be seen (WCAG 1.4.11): 3:1, Lc 30 (solid icons). */
const SHAPE = { light: m(3, 30), dark: m(3, 30), night: m(3, 20) };
/** Large bold label on a solid colour (a chip, a slab): WCAG large text. */
const ON_SOLID = { light: m(4.5, 60), dark: m(4.5, 45), night: m(4.5, 30), 'light-more': m(6, 70), 'dark-more': m(6, 55) };

export const PAIRINGS: readonly Pairing[] = [
	{ fg: 'label', on: [...OPAQUE, 'key', 'cell>fill-3', 'cell>selection', 'bg>mat-bar', 'cell>mat-bar'], min: BODY, why: 'Primary text' },
	{ fg: 'label-2', on: [...OPAQUE, 'cell>selection'], min: SECONDARY, why: 'Secondary text' },
	{ fg: 'label-3', on: OPAQUE, min: TERTIARY, why: 'Placeholders, disabled' },
	{ fg: 'tint', on: [...CONTENT, 'mat-bar-solid', 'mat-sheet-solid', 'cell>tint-fill'], min: ACCENT, why: 'Links, buttons, the selected tab' },
	{ fg: 'on-tint', on: ['tint', 'tint-pressed'], min: ON_SOLID, why: 'Text on the tint (an icon tile)' },
	{ fg: 'on-tint-solid', on: ['tint-solid'], min: { ...ON_SOLID, 'dark-more': m(4.5, 55) }, why: 'Filled button label, switch knob' },
	{ fg: 'tint-solid', on: ['cell', 'bg', 'cell-elevated'], min: { light: m(3, 30), dark: m(3, 15), night: m(1, 0), 'dark-more': m(2.5, 15) }, why: 'A switch that is on, seen against its row (night: the ring carries it)' },
	{ fg: 'rolling', on: [...CONTENT, 'rail'], min: STATUS, why: 'The clock while rolling' },
	{ fg: 'destructive', on: [...CONTENT, 'mat-sheet-solid'], min: STATUS, why: 'Delete' },
	{ fg: 'on-destructive', on: ['destructive-solid'], min: ON_SOLID, why: 'Filled delete, swipe action' },
	{ fg: 'good', on: [...CONTENT, 'cell>good@status-fill'], min: STATUS, why: 'Circled' },
	{ fg: 'no-good', on: CONTENT, min: STATUS, why: 'NG, struck through' },
	{ fg: 'warning', on: [...CONTENT, 'cell>warning@status-fill'], min: STATUS, why: 'Warnings' },
	{ fg: 'changed', on: CONTENT, min: STATUS, why: 'Changed since the last take' },
	{ fg: 'unsynced', on: [...CONTENT, 'cell>unsynced@status-fill', 'mat-bar-solid'], min: STATUS, why: 'Unsynced count' },
	{ fg: 'synced', on: [...CONTENT, 'cell>synced@status-fill', 'mat-bar-solid'], min: STATUS, why: 'Synced' },
	{ fg: 'conflict', on: [...CONTENT, 'cell>conflict@status-fill'], min: STATUS, why: 'Conflict' },
	{ fg: 'on-record', on: ['record'], min: { light: m(3, 45), dark: m(3, 45), night: m(4.5, 30) }, why: 'The bold word on the rolling slab: large text' },
	{ fg: 'record', on: ['rail', 'bg', 'cell'], min: SHAPE, why: 'The Record disc must be seen' },
	{ fg: 'record-ring', on: ['rail'], min: SHAPE, why: 'The ring round Record' },
	{ fg: 'focus', on: [...OPAQUE, 'key'], min: SHAPE, why: 'Focus ring' },
	{ fg: 'key-label', on: ['key'], min: BODY, why: 'Digits' },
	{ fg: 'key-label', on: ['key-alt'], min: { light: m(7, 75), dark: m(7, 75), night: m(4.5, 33) }, why: 'The point and delete: 28 px glyphs' },
	{ fg: 'key-pressed-label', on: ['key-pressed'], min: { light: m(7, 75), dark: m(7, 75), night: m(3, 22) }, why: 'A pressed digit (night: bright digit, dim key, and the state ring)' },
	{ fg: 'label', on: ['rail>rail-button', 'cell>fill-2'], min: BODY, why: 'Icons and words on rail and gray buttons' },
	{ fg: 'rail-pressed-label', on: ['rail-pressed'], min: { light: m(7, 75), dark: m(7, 75), night: m(4.5, 30) }, why: 'A pressed or on rail button' },
	{ fg: 'separator-opaque', on: ['cell', 'bg'], min: { light: m(1.25, 0), dark: m(1.25, 0), night: m(1.2, 0), 'light-more': m(2, 15), 'dark-more': m(2, 15), 'night-more': m(1.5, 0) }, why: 'Hairlines: present, quiet; strong with Increase Contrast' },
	{ fg: 'separator', on: ['cell', 'bg-elevated'], min: { light: m(1.25, 0), dark: m(1.25, 0), night: m(1.2, 0), 'light-more': m(2, 15), 'dark-more': m(2, 15), 'night-more': m(1.5, 0) }, why: 'Hairlines over any surface' }
];

/** The target for a pairing in a scheme, or none. */
export function targetFor(p: Pairing, scheme: Scheme): Min | undefined {
	const mode = scheme.split('-')[0] as Mode;
	return p.min[scheme] ?? (scheme.endsWith('-more') ? p.min[mode] : undefined);
}
