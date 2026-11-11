import { describe, expect, it } from 'vitest';
import { focalEditable, focalLengthOf } from './focal';
import type { Lens } from './types';

const prime: Lens = { name: '40', kind: 'prime', focalLength: 40 };
const zoom: Lens = { name: '24-290', kind: 'zoom', min: 24, max: 290 };

describe('focalLengthOf', () => {
	it('is the lens on a prime, whatever was entered', () => {
		expect(focalLengthOf(prime, null)).toBe(40);
		expect(focalLengthOf(prime, 85)).toBe(40);
	});
	it('is what was entered on a zoom', () => {
		expect(focalLengthOf(zoom, 85)).toBe(85);
	});
	it('is empty on a zoom until entered', () => {
		expect(focalLengthOf(zoom, null)).toBeNull();
	});
	it('stays inside the zoom range', () => {
		expect(focalLengthOf(zoom, 12)).toBe(24);
		expect(focalLengthOf(zoom, 400)).toBe(290);
	});
});

describe('focalEditable', () => {
	it('only on a zoom', () => {
		expect(focalEditable(prime)).toBe(false);
		expect(focalEditable(zoom)).toBe(true);
	});
});
