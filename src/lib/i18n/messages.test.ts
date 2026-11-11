import { describe, expect, it } from 'vitest';
import { fill, t } from './messages';
import { en } from './en';

describe('fill', () => {
	it('puts values in the braces', () => {
		expect(fill('Take {take} filed', { take: '3' })).toBe('Take 3 filed');
		expect(fill('{a} of {b}', { a: 1, b: 2 })).toBe('1 of 2');
	});
	it('leaves an unknown name as it is', () => {
		expect(fill('Take {take}', {})).toBe('Take {take}');
	});
});

describe('t', () => {
	it('reads the catalogue', () => {
		expect(t('rail.record')).toBe(en['rail.record']);
	});
	it('fills values', () => {
		expect(t('undo.filed', { take: '3' })).toContain('3');
	});
	it('has no empty message', () => {
		expect(Object.values(en).every((m) => m.trim().length > 0)).toBe(true);
	});
});
