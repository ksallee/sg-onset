import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { sidebarStrip, sidebarToggle } from './sidebar';

describe('sidebarStrip', () => {
	it('is open elsewhere and a strip on the capture destination at first', () => {
		expect(sidebarStrip(DEFAULT_SETTINGS, false)).toBe(false);
		expect(sidebarStrip(DEFAULT_SETTINGS, true)).toBe(true);
	});
	it('follows each choice on its own destination', () => {
		const s = { ...DEFAULT_SETTINGS, sidebar: 'strip' as const, captureSidebar: 'open' as const };
		expect(sidebarStrip(s, false)).toBe(true);
		expect(sidebarStrip(s, true)).toBe(false);
	});
});

describe('sidebarToggle', () => {
	it('changes only the choice of the destination it is pressed on', () => {
		expect(sidebarToggle(DEFAULT_SETTINGS, true)).toEqual({ captureSidebar: 'open' });
		expect(sidebarToggle(DEFAULT_SETTINGS, false)).toEqual({ sidebar: 'strip' });
		expect(sidebarToggle({ ...DEFAULT_SETTINGS, captureSidebar: 'open' }, true)).toEqual({ captureSidebar: 'strip' });
		expect(sidebarToggle({ ...DEFAULT_SETTINGS, sidebar: 'strip' }, false)).toEqual({ sidebar: 'open' });
	});
});
