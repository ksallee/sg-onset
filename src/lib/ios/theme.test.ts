import { describe, expect, it } from 'vitest';
import { THEMES, THEME_CLASSES, THEME_COLOR, themeClass } from './theme';

describe('themeClass', () => {
	it('builds on the kit light and dark classes', () => {
		expect(themeClass('day')).toBe('ios-light ios-day');
		expect(themeClass('dark')).toBe('ios-dark');
		expect(themeClass('night')).toBe('ios-dark ios-night');
	});
	it('uses only classes that can be cleared', () => {
		for (const theme of THEMES) {
			for (const cls of themeClass(theme).split(' ')) expect(THEME_CLASSES).toContain(cls);
		}
	});
});

describe('THEME_COLOR', () => {
	it('has a colour per theme', () => {
		expect(THEMES.every((theme) => /^#[0-9A-F]{6}$/.test(THEME_COLOR[theme]))).toBe(true);
	});
});
