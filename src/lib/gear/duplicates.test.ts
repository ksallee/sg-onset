import { describe, expect, it } from 'vitest';
import type { Camera, Lens } from '$lib/model/types';
import { findDuplicate, isSameGear } from './duplicates';

const cam = (id: string, cameraModel: string, cameraSerialNumber?: string): Camera => ({ id, projectId: 'p', cameraModel, ...(cameraSerialNumber ? { cameraSerialNumber } : {}) });
const lens = (id: string, lensModel: string, lensSerialNumber?: string): Lens => ({ id, projectId: 'p', lensModel, ...(lensSerialNumber ? { lensSerialNumber } : {}) });

describe('isSameGear', () => {
	it('matches on model and serial number, whatever the case and spaces', () => {
		expect(isSameGear('camera', cam('1', 'Alexa 35', 'K1-001'), cam('2', ' alexa  35 ', 'k1-001'))).toBe(true);
		expect(isSameGear('camera', cam('1', 'Alexa 35', 'K1-001'), cam('2', 'Alexa 35', 'K1-002'))).toBe(false);
		expect(isSameGear('lens', lens('1', 'S4/i 32', '123'), lens('2', 'S4/i 50', '123'))).toBe(false);
	});
	it('matches on model alone when neither has a serial number', () => {
		expect(isSameGear('lens', lens('1', 'S4/i 32'), lens('2', 'S4/i 32'))).toBe(true);
	});
	it('does not match when only one has a serial number', () => {
		expect(isSameGear('lens', lens('1', 'S4/i 32', '123'), lens('2', 'S4/i 32'))).toBe(false);
	});
	it('never matches a record with no model', () => {
		expect(isSameGear('lens', { id: '1', projectId: 'p' }, { id: '2', projectId: 'p' })).toBe(false);
	});
});

describe('findDuplicate', () => {
	it('gives the first record that is the same gear', () => {
		const list = [cam('1', 'Venice 2'), cam('2', 'Alexa 35', 'A'), cam('3', 'Alexa 35', 'A')];
		expect(findDuplicate('camera', list, cam('x', 'Alexa 35', 'a'))?.id).toBe('2');
		expect(findDuplicate('camera', list, cam('x', 'Alexa 35', 'B'))).toBeUndefined();
	});
});
