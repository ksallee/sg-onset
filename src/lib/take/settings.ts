// The prototype's settings: hand, theme, gloves. Read from the URL so a link opens a given
// setup (`?hand=left&theme=night&gloves=1`). Pure.
import type { Hand } from '$lib/ios/handedness';

export { THEMES, themeClass, type ThemeName } from '$lib/ios/theme';
import type { ThemeName } from '$lib/ios/theme';
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
