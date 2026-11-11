// The settings kept on this device: how the app is held, looks and moves, the units lengths show
// in, and where the person last was. Pure; the browser side is settings.svelte.ts, and the inline
// script in app.html applies the theme, the hand and the motion before the first paint (keep the two in step).

import type { Hand } from '$lib/ios/handedness';
import { captureTarget } from '$lib/ios/target';
import { THEME_COLOR, themeClass, type ThemeName } from '$lib/ios/theme';
import type { UnitSystem } from '$lib/model/length';

export const SETTINGS_KEY = 'sg-onset.settings';

/** Where the person last was. A project that changes clears the day and the slate; a day, the slate. */
export interface Last {
	projectId?: string;
	shootDayId?: string;
	slateId?: string;
}

/** System follows the device (`prefers-color-scheme`). */
export type Appearance = 'system' | 'light' | 'dark';
export const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

/** Standard: capture targets of 15 mm. Large: 20 mm, and every other target larger too. Large suits gloves. */
export type ButtonSize = 'standard' | 'large';
export const BUTTON_SIZES: readonly ButtonSize[] = ['standard', 'large'];

export interface Settings {
	/** The hand that holds the device: the action rail is under its thumb. */
	hand: Hand;
	appearance: Appearance;
	/** Red night mode: red on black, for a dark set. On, it wins over the appearance. */
	night: boolean;
	buttonSize: ButtonSize;
	/** How lengths are shown and typed. Stored values are metres. */
	units: UnitSystem;
	/** Motion: as the device asks (`prefers-reduced-motion`), always full, or always reduced. */
	motion: Motion;
	/** The sidebar in landscape: with names, or a strip of icons. */
	sidebar: 'open' | 'strip';
	/** The same on the capture destination, kept apart: it starts as a strip, for the room. */
	captureSidebar: 'open' | 'strip';
	last: Last;
	/** The sample project, if it was loaded: so Settings can delete it. */
	sampleProjectId?: string;
}

export type Motion = 'system' | 'full' | 'reduced';
export const MOTIONS: readonly Motion[] = ['system', 'full', 'reduced'];

export const DEFAULT_SETTINGS: Settings = { hand: 'right', appearance: 'system', night: false, buttonSize: 'standard', units: 'metric', motion: 'system', sidebar: 'open', captureSidebar: 'strip', last: {} };

/**
 * The look in force. `theme` is `data-theme` on <html>: the appearance, or with `system` what the
 * device asks; red night mode is always dark. `night` is `data-night="true"`. `kit` is the kit
 * theme whose classes carry the tokens today (ios/theme.ts): Day for light, Dark, Night.
 */
export function resolveTheme(settings: Pick<Settings, 'appearance' | 'night'>, systemDark: boolean): { theme: 'light' | 'dark'; night: boolean; kit: ThemeName } {
	if (settings.night) return { theme: 'dark', night: true, kit: 'night' };
	const dark = settings.appearance === 'dark' || (settings.appearance === 'system' && systemDark);
	return { theme: dark ? 'dark' : 'light', night: false, kit: dark ? 'dark' : 'day' };
}

/** The motion in force, `data-motion` on <html>: the choice, or with `system` what the device asks. */
export function resolveMotion(choice: Motion, systemReduced: boolean): 'full' | 'reduced' {
	return choice === 'system' ? (systemReduced ? 'reduced' : 'full') : choice;
}

const id = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** What was stored, with anything unreadable or unknown replaced by the default. */
export function parseSettings(raw: string | null | undefined): Settings {
	let value: unknown;
	try {
		value = raw ? JSON.parse(raw) : null;
	} catch {
		value = null;
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_SETTINGS;
	const v = value as Record<string, unknown>;
	const last = (v.last !== null && typeof v.last === 'object' ? v.last : {}) as Record<string, unknown>;
	return compact({
		hand: v.hand === 'left' || v.hand === 'right' ? v.hand : DEFAULT_SETTINGS.hand,
		appearance: APPEARANCES.includes(v.appearance as Appearance) ? (v.appearance as Appearance) : DEFAULT_SETTINGS.appearance,
		night: v.night === true,
		buttonSize: v.buttonSize === 'large' ? 'large' : 'standard',
		units: v.units === 'imperial' || v.units === 'metric' ? v.units : DEFAULT_SETTINGS.units,
		motion: MOTIONS.includes(v.motion as Motion) ? (v.motion as Motion) : DEFAULT_SETTINGS.motion,
		sidebar: v.sidebar === 'strip' ? 'strip' : 'open',
		captureSidebar: v.captureSidebar === 'open' ? 'open' : 'strip',
		last: compact({ projectId: id(last.projectId), shootDayId: id(last.shootDayId), slateId: id(last.slateId) }),
		sampleProjectId: id(v.sampleProjectId)
	});
}

export function serializeSettings(settings: Settings): string {
	return JSON.stringify(settings);
}

/**
 * `settings` with the place changed. Picking another project forgets the day and the slate,
 * another day forgets the slate: they belong to what was left. `undefined` forgets a level.
 */
export function withLast(settings: Settings, place: Last): Settings {
	let last = { ...settings.last };
	if ('projectId' in place && place.projectId !== last.projectId) last = { projectId: place.projectId };
	if ('shootDayId' in place && place.shootDayId !== last.shootDayId) last = { projectId: last.projectId, shootDayId: place.shootDayId };
	if ('slateId' in place) last.slateId = place.slateId;
	return { ...settings, last: compact(last) };
}

/** Touch targets outside the capture path: Apple's 44 px, 56 px at the large button size. */
export const TOUCH_PX = 44;
export const LARGE_TOUCH_PX = 56;

/** What the settings put on <html>. */
export interface DocumentLook {
	/** `data-theme`. */
	theme: 'light' | 'dark';
	/** `data-night="true"` when on. */
	night: boolean;
	/** The kit's theme classes. */
	classes: string[];
	/** `data-hand`. */
	hand: Hand;
	/** `data-motion`. */
	motion: 'full' | 'reduced';
	/** `data-button-size`. */
	buttonSize: ButtonSize;
	/** `--target` and `--gap`: the capture target and its spacing, px. */
	target: number;
	gap: number;
	/** `--touch`: the least height of any other target, px. */
	touch: number;
	/** The theme-color meta: the status bar and browser chrome. */
	themeColor: string;
}

/** `system`: what the device asks for, which the pure side cannot read. */
export function documentLook(settings: Settings, system: { dark: boolean; reducedMotion: boolean }): DocumentLook {
	const look = resolveTheme(settings, system.dark);
	const large = settings.buttonSize === 'large';
	const target = captureTarget(large);
	return {
		theme: look.theme,
		night: look.night,
		classes: themeClass(look.kit).split(' '),
		hand: settings.hand,
		motion: resolveMotion(settings.motion, system.reducedMotion),
		buttonSize: settings.buttonSize,
		target: target.size,
		gap: target.gap,
		touch: large ? LARGE_TOUCH_PX : TOUCH_PX,
		themeColor: THEME_COLOR[look.kit]
	};
}
