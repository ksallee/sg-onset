import { describe, expect, it } from 'vitest';
import { hasMessage } from '$lib/i18n/messages';
import { TAB_ROOTS } from '$lib/ios/direction';
import { NAV, activeNav } from './nav';

describe('NAV', () => {
	it('lists the five destinations, Shoot first', () => {
		expect(NAV.map((n) => n.id)).toEqual(['shoot', 'slates', 'gear', 'templates', 'settings']);
	});
	it('has a label for each, and each is a tab root: moving between them does not slide', () => {
		for (const entry of NAV) {
			expect(hasMessage(entry.labelKey)).toBe(true);
			expect(TAB_ROOTS).toContain(entry.href);
		}
	});
	it('gives only the capture flow the room', () => {
		expect(NAV.filter((n) => n.focus).map((n) => n.id)).toEqual(['shoot']);
	});
});

describe('activeNav', () => {
	it('finds the destination of a page and of the pages under it', () => {
		expect(activeNav('/slates')?.id).toBe('slates');
		expect(activeNav('/slates/abc')?.id).toBe('slates');
		expect(activeNav('/settings/')?.id).toBe('settings');
	});
	it('does not take a path that only starts alike', () => {
		expect(activeNav('/slates-old')).toBeUndefined();
	});
	it('finds none outside the shell', () => {
		expect(activeNav('/')).toBeUndefined();
		expect(activeNav('/welcome')).toBeUndefined();
	});
	it('counts sign-in as part of Settings', () => {
		expect(activeNav('/sign-in')?.id).toBe('settings');
	});
});
