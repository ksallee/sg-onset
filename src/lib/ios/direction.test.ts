import { describe, expect, it } from 'vitest';
import { depth, navDirection, pageMotion } from './direction';

describe('depth', () => {
	it('tabs are 0, details 1, deeper more', () => {
		expect(depth('/')).toBe(0);
		expect(depth('/sessions')).toBe(0);
		expect(depth('/settings/')).toBe(0);
		expect(depth('/t/box')).toBe(1);
		expect(depth('/course/beginner')).toBe(1);
		expect(depth('/s/abc')).toBe(1);
		expect(depth('/proto/ios')).toBe(1);
	});
});

describe('sg-onset routes', () => {
	it('the destinations fade between each other, never slide', () => {
		expect(navDirection('/shoot', '/slates')).toBe('fade');
		expect(navDirection('/gear', '/templates')).toBe('fade');
		expect(navDirection('/settings', '/shoot')).toBe('fade');
		expect(navDirection('/slates', '/wrap')).toBe('fade');
		expect(navDirection('/wrap', '/gear')).toBe('fade');
	});
	it('the day report pushes over Wrap and pops back; from another destination it fades', () => {
		expect(navDirection('/wrap', '/wrap/report')).toBe('push');
		expect(navDirection('/wrap/report', '/wrap')).toBe('pop');
		expect(navDirection('/wrap/report', '/shoot')).toBe('fade');
	});
	it('sign-in pushes over Settings and pops back', () => {
		expect(navDirection('/settings', '/sign-in')).toBe('push');
		expect(navDirection('/sign-in', '/settings')).toBe('pop');
	});
	it('a page of one destination to a page of another fades, back or forward either', () => {
		expect(navDirection('/slates/abc', '/shoot')).toBe('fade');
		expect(navDirection('/shoot', '/slates/abc')).toBe('fade');
		expect(navDirection('/sign-in', '/slates')).toBe('fade');
		expect(navDirection('/shoot', '/slates/abc', 'back')).toBe('fade');
	});
	it('into and out of the shell fades', () => {
		expect(navDirection('/welcome', '/slates')).toBe('fade');
		expect(navDirection('/', '/welcome')).toBe('fade');
	});
	it('a page outside the destinations still pushes', () => {
		expect(navDirection('/shoot', '/proto/take')).toBe('push');
		expect(navDirection('/proto/take', '/shoot')).toBe('pop');
	});
	it('a slate pushes over the list and pops back', () => {
		expect(navDirection('/slates', '/slates/abc')).toBe('push');
		expect(navDirection('/slates/abc', '/slates')).toBe('pop');
	});
});

describe('navDirection', () => {
	it('deeper pushes, shallower pops', () => {
		expect(navDirection('/', '/t/box')).toBe('push');
		expect(navDirection('/t/box', '/')).toBe('pop');
		expect(navDirection('/sessions', '/s/abc')).toBe('push');
	});
	it('across tabs: a fade', () => {
		expect(navDirection('/', '/sessions')).toBe('fade');
		expect(navDirection('/settings', '/')).toBe('fade');
	});
	it('the same page or no page: none', () => {
		expect(navDirection('/s/abc', '/s/abc')).toBe('none');
		expect(navDirection(null, '/')).toBe('none');
		expect(navDirection('/', null)).toBe('none');
	});
	it('a sibling detail is a push', () => {
		expect(navDirection('/t/box', '/s/abc')).toBe('push');
	});
	it('run comes up as a cover and goes down as one', () => {
		expect(navDirection('/s/abc', '/s/abc/run')).toBe('cover');
		expect(navDirection('/t/box', '/s/abc/run')).toBe('cover');
		expect(navDirection('/s/abc/run', '/s/abc')).toBe('uncover');
		expect(navDirection('/s/abc/run', '/')).toBe('uncover');
	});
	it('history back pops and forward pushes, whatever the depth', () => {
		expect(navDirection('/s/abc', '/t/box', 'back')).toBe('pop');
		expect(navDirection('/t/box', '/s/abc', 'forward')).toBe('push');
		expect(navDirection('/', '/t/box', 'back')).toBe('pop');
	});
	it('history back to or from run still uses the cover', () => {
		expect(navDirection('/s/abc/run', '/s/abc', 'back')).toBe('uncover');
		expect(navDirection('/s/abc', '/s/abc/run', 'forward')).toBe('cover');
	});
	it('history between tab roots fades', () => {
		expect(navDirection('/sessions', '/', 'back')).toBe('fade');
	});
});

describe('pageMotion', () => {
	it('is the direction when nothing says otherwise', () => {
		expect(pageMotion('push')).toBe('push');
		expect(pageMotion('pop')).toBe('pop');
		expect(pageMotion('fade')).toBe('fade');
		expect(pageMotion('none')).toBe('none');
	});
	it('reduced motion turns every move into a fade', () => {
		expect(pageMotion('push', { reduced: true })).toBe('fade');
		expect(pageMotion('uncover', { reduced: true })).toBe('fade');
		expect(pageMotion('none', { reduced: true })).toBe('none');
	});
	it('to or from the capture path nothing fades; a push still pushes', () => {
		expect(pageMotion('fade', { focus: true })).toBe('none');
		expect(pageMotion('push', { focus: true })).toBe('push');
	});
	it("after the system's own back swipe nothing moves twice", () => {
		expect(pageMotion('pop', { swiped: true })).toBe('none');
		expect(pageMotion('push', { swiped: true })).toBe('none');
		expect(pageMotion('fade', { swiped: true })).toBe('none');
	});
});
