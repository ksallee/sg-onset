import { describe, expect, it } from 'vitest';
import { APPEARANCES, THEME_COLOR, parseAppearance, resolveAppearance } from './appearance';

describe('parseAppearance', () => {
	it('reads a stored choice', () => {
		expect(parseAppearance('light')).toBe('light');
		expect(parseAppearance('dark')).toBe('dark');
		expect(parseAppearance('system')).toBe('system');
	});
	it('falls back to System for nothing or nonsense', () => {
		expect(parseAppearance(null)).toBe('system');
		expect(parseAppearance('sepia')).toBe('system');
	});
});

describe('resolveAppearance', () => {
	it('follows the system on System', () => {
		expect(resolveAppearance('system', true)).toBe('dark');
		expect(resolveAppearance('system', false)).toBe('light');
	});
	it('an explicit choice wins over the system', () => {
		expect(resolveAppearance('light', true)).toBe('light');
		expect(resolveAppearance('dark', false)).toBe('dark');
	});
});

describe('the tables', () => {
	it('lists System, Light, Dark in that order', () => {
		expect(APPEARANCES.map((a) => a.label)).toEqual(['System', 'Light', 'Dark']);
	});
	it('has the bar colour of each mode', () => {
		expect(THEME_COLOR).toEqual({ dark: '#000000', light: '#F2F2F7' });
	});
});
