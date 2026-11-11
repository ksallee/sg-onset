// The prototype's settings: hand, theme, gloves. Read from the URL so a link opens a given
// setup (`?hand=left&theme=night&gloves=1`). Pure.
import type { Hand } from '$lib/ios/handedness';

export type ThemeName = 'day' | 'dark' | 'night';
export const THEMES: readonly ThemeName[] = ['day', 'dark', 'night'];
export const HANDS: readonly Hand[] = ['left', 'right'];

export interface Settings {
	hand: Hand;
	theme: ThemeName;
	gloves: boolean;
}

export const DEFAULT_SETTINGS: Settings = { hand: 'right', theme: 'dark', gloves: false };

export function parseSettings(params: URLSearchParams): Settings {
	const hand = params.get('hand');
	const theme = params.get('theme');
	return {
		hand: hand === 'left' || hand === 'right' ? hand : DEFAULT_SETTINGS.hand,
		theme: theme === 'day' || theme === 'dark' || theme === 'night' ? theme : DEFAULT_SETTINGS.theme,
		gloves: params.get('gloves') === '1'
	};
}

/** The classes that force a theme on a subtree (app.css): Day sits on light, Night on dark. */
export function themeClass(theme: ThemeName): string {
	if (theme === 'day') return 'ios-light ios-day';
	if (theme === 'night') return 'ios-dark ios-night';
	return 'ios-dark';
}
