import { describe, expect, it } from 'vitest';
import { fieldRef } from '$lib/slates/fields';
import { valueText } from './values';

describe('valueText', () => {
	it('shows a take with no type as Main, and a type by its label', () => {
		const ref = fieldRef('take', 'takeType')!;
		expect(valueText(ref, undefined, 'metric')).toBe('Main');
		expect(valueText(ref, 'ballsAndChart', 'metric')).toBe('Balls and chart');
	});
	it('shows the plates at the tail by their labels, nothing for none', () => {
		const ref = fieldRef('take', 'takeTail')!;
		expect(valueText(ref, ['cleanPlate', 'ballsAndChart'], 'metric')).toBe('Clean plate, Balls and chart');
		expect(valueText(ref, undefined, 'metric')).toBe('');
		expect(valueText(ref, [], 'metric')).toBe('');
	});
	it('shows a rig by its label, a project rig as typed (#138)', () => {
		for (const scope of ['take', 'cameraSetup'] as const) {
			const ref = fieldRef(scope, 'cameraMount')!;
			expect(valueText(ref, 'hiHat', 'metric')).toBe('Hi-hat');
			expect(valueText(ref, 'Russian arm', 'metric')).toBe('Russian arm');
			expect(valueText(ref, undefined, 'metric')).toBe('');
		}
	});
	it('shows nothing for a field with no value', () => {
		expect(valueText(fieldRef('take', 'tStop')!, undefined, 'metric')).toBe('');
	});
});
