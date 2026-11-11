import { describe, expect, it } from 'vitest';
import { BACK_MAX, backLabel } from './back';

describe('backLabel', () => {
	it('keeps a short title', () => {
		expect(backLabel('Sessions')).toBe('Sessions');
		expect(backLabel('Music')).toBe('Music');
	});
	it('says Back when the title is too long for the bar', () => {
		expect(backLabel('Beginner Path')).toBe('Back');
		expect(backLabel('Build · 2 of 4')).toBe('Back');
	});
	it('takes exactly BACK_MAX characters', () => {
		expect(backLabel('x'.repeat(BACK_MAX))).toBe('x'.repeat(BACK_MAX));
		expect(backLabel('x'.repeat(BACK_MAX + 1))).toBe('Back');
	});
	it('says Back for an empty title', () => {
		expect(backLabel('  ')).toBe('Back');
	});
});
