// The three themes of the kit and the classes that put one on a subtree or on <html> (app.css).
// Day sits on light, Night on dark. Pure.

export type ThemeName = 'day' | 'dark' | 'night';
export const THEMES: readonly ThemeName[] = ['day', 'dark', 'night'];

/** The classes that force a theme: `ios-light ios-day`, `ios-dark`, `ios-dark ios-night`. */
export function themeClass(theme: ThemeName): string {
	if (theme === 'day') return 'ios-light ios-day';
	if (theme === 'night') return 'ios-dark ios-night';
	return 'ios-dark';
}

/** Every class a theme can set, to clear before setting another. */
export const THEME_CLASSES: readonly string[] = ['ios-light', 'ios-day', 'ios-dark', 'ios-night'];

/** The status bar and browser chrome colour of each theme: its `--bg`. */
export const THEME_COLOR: Record<ThemeName, string> = { day: '#ECECF1', dark: '#000000', night: '#000000' };
