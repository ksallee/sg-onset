import { describe, expect, it } from 'vitest';
import { fill, hasMessage, t, tk } from './messages';
import { AREAS, en } from './en';

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

describe('tk', () => {
	it('reads a key held as data', () => {
		expect(tk('field.take.tilt')).toBe('Tilt');
		expect(tk('sync.pending', { n: 4 })).toBe('4 to sync');
	});
	it('gives an unknown key back, so the gap shows', () => {
		expect(hasMessage('field.take.nope')).toBe(false);
		expect(tk('field.take.nope')).toBe('field.take.nope');
		expect(hasMessage('toString')).toBe(false);
	});
});

describe('the catalogue by area', () => {
	it('has the eleven areas', () => {
		expect(Object.keys(AREAS).sort()).toEqual(['auth', 'common', 'fields', 'gear', 'import', 'settings', 'slates', 'sync', 'take', 'templates', 'validation']);
	});
	it('holds each key in one area only', () => {
		const seen = new Map<string, string>();
		const twice: string[] = [];
		for (const [area, messages] of Object.entries(AREAS)) {
			for (const key of Object.keys(messages)) {
				if (seen.has(key)) twice.push(`${key} (${seen.get(key)}, ${area})`);
				seen.set(key, area);
			}
		}
		expect(twice).toEqual([]);
		expect(Object.keys(en)).toHaveLength(seen.size);
	});
});
