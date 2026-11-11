import { describe, expect, it } from 'vitest';
import { renderCompatCss } from '$lib/theme/css';
import { THEMES, themeClass } from './theme';

describe('themeClass', () => {
	it('builds on the old kit light and dark classes', () => {
		expect(themeClass('day')).toBe('ios-light ios-day');
		expect(themeClass('dark')).toBe('ios-dark');
		expect(themeClass('night')).toBe('ios-dark ios-night');
	});
	it('uses only classes that compat.css gives the tokens (ios-day is light alone)', () => {
		const css = renderCompatCss();
		for (const theme of THEMES)
			for (const cls of themeClass(theme).split(' ').filter((c) => c !== 'ios-day')) expect(css).toContain(`:where(.${cls})`);
	});
});
