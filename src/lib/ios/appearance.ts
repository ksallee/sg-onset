// Appearance: System, Light or Dark (Settings). Pure; the browser side is appearance.svelte.ts,
// and the inline script in app.html applies it before the first paint (keep the two in step).

export type Appearance = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const APPEARANCE_KEY = 'sg-onset.appearance';

export const APPEARANCES: { value: Appearance; label: string }[] = [
	{ value: 'system', label: 'System' },
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' }
];

/** The status bar and browser chrome colour of each mode: `--bg`. */
export const THEME_COLOR: Record<Theme, string> = { dark: '#000000', light: '#F2F2F7' };

export function parseAppearance(raw: string | null): Appearance {
	return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function resolveAppearance(choice: Appearance, systemDark: boolean): Theme {
	return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}
