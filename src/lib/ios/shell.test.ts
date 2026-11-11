import { describe, expect, it } from 'vitest';
import { formFor } from './handedness';
import { SIDEBAR_W, STRIP_W, shellLayout } from './shell';

describe('shellLayout', () => {
	it('is a sidebar on the far side edge on an iPad in landscape', () => {
		expect(shellLayout('right', 1180)).toEqual({ nav: 'side', edge: 'left', strip: false, taken: SIDEBAR_W });
		expect(shellLayout('left', 1180)).toEqual({ nav: 'side', edge: 'right', strip: false, taken: SIDEBAR_W });
	});
	it('collapses to a strip when asked, or when the page needs the room', () => {
		expect(shellLayout('right', 1180, { strip: true })).toMatchObject({ nav: 'side', strip: true, taken: STRIP_W });
		expect(shellLayout('right', 1180, { focus: true })).toMatchObject({ nav: 'side', strip: true, taken: STRIP_W });
	});
	it('is a bar across the top in portrait and in a phone-width window, never a strip', () => {
		expect(shellLayout('right', 820, { strip: true })).toEqual({ nav: 'top', edge: 'left', strip: false, taken: 0 });
		expect(shellLayout('left', 390)).toEqual({ nav: 'top', edge: 'right', strip: false, taken: 0 });
	});
	it('is never on the edge of the holding hand', () => {
		for (const width of [390, 820, 1180, 1366]) {
			expect(shellLayout('right', width).edge).toBe('left');
			expect(shellLayout('left', width).edge).toBe('right');
		}
	});
	it('leaves a Workspace its wide form beside the strip in landscape, and its tall form in portrait', () => {
		expect(formFor(1180 - shellLayout('right', 1180, { focus: true }).taken)).toBe('wide');
		expect(formFor(1024 - shellLayout('right', 1024, { focus: true }).taken)).not.toBe('compact');
		expect(formFor(820 - shellLayout('right', 820, { focus: true }).taken)).toBe('tall');
	});
});
