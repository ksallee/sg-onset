import { describe, expect, it } from 'vitest';
import { fieldRef } from '$lib/slates/fields';
import { valueText } from './values';

describe('valueText', () => {
	it('shows a take with no type as Main, and a type by its label', () => {
		const ref = fieldRef('take', 'takeType')!;
		expect(valueText(ref, undefined, 'metric')).toBe('Main');
		expect(valueText(ref, 'ballsAndChart', 'metric')).toBe('Balls and chart');
	});
	it('shows nothing for a field with no value', () => {
		expect(valueText(fieldRef('take', 'tStop')!, undefined, 'metric')).toBe('');
	});
});
