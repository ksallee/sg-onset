import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, themeClass } from './settings';

describe('parseSettings', () => {
	it('defaults to right hand, dark, bare hands', () => {
		expect(parseSettings(new URLSearchParams(''))).toEqual(DEFAULT_SETTINGS);
		expect(DEFAULT_SETTINGS).toEqual({ hand: 'right', theme: 'dark', gloves: false });
	});
	it('reads hand, theme and gloves', () => {
		expect(parseSettings(new URLSearchParams('hand=left&theme=night&gloves=1'))).toEqual({ hand: 'left', theme: 'night', gloves: true });
	});
	it('ignores nonsense', () => {
		expect(parseSettings(new URLSearchParams('hand=both&theme=sepia&gloves=maybe'))).toEqual(DEFAULT_SETTINGS);
	});
});

describe('themeClass', () => {
	it('builds on the kit light and dark classes', () => {
		expect(themeClass('day')).toBe('ios-light ios-day');
		expect(themeClass('dark')).toBe('ios-dark');
		expect(themeClass('night')).toBe('ios-dark ios-night');
	});
});
