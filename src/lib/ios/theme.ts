// The take prototype's three themes and the old kit classes that put one on a subtree. The app
// itself sets `data-theme` and `data-night` (lib/app/settings.ts); app.css keeps the classes
// working through lib/theme/compat.css. Delete this file once the prototype uses the attributes:
// day is `data-theme="light"`, dark `data-theme="dark"`, night adds `data-night="true"`. Pure.

export type ThemeName = 'day' | 'dark' | 'night';
export const THEMES: readonly ThemeName[] = ['day', 'dark', 'night'];

/** The classes that force a theme: `ios-light ios-day`, `ios-dark`, `ios-dark ios-night`. */
export function themeClass(theme: ThemeName): string {
	if (theme === 'day') return 'ios-light ios-day';
	if (theme === 'night') return 'ios-dark ios-night';
	return 'ios-dark';
}
