import { describe, expect, it } from 'vitest';
import { depth, navDirection } from './direction';

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

describe('navDirection', () => {
	it('deeper pushes, shallower pops', () => {
		expect(navDirection('/', '/t/box')).toBe('push');
		expect(navDirection('/t/box', '/')).toBe('pop');
		expect(navDirection('/sessions', '/s/abc')).toBe('push');
	});
	it('across tabs: none', () => {
		expect(navDirection('/', '/sessions')).toBe('none');
		expect(navDirection('/settings', '/')).toBe('none');
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
	it('history between tab roots does not move', () => {
		expect(navDirection('/sessions', '/', 'back')).toBe('none');
	});
});
