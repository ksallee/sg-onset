import { describe, expect, it } from 'vitest';
import { readTakeValue } from './values';

const fps24 = { num: 24, denom: 1 };

describe('readTakeValue', () => {
	it('reads a T-stop with its letter or as an f-number', () => {
		expect(readTakeValue('tStop', 'T2.8', fps24)).toBe(2.8);
		expect(readTakeValue('tStop', 'f/4', fps24)).toBe(4);
		expect(readTakeValue('tStop', ' 5,6 ', fps24)).toBe(5.6);
	});

	it('reads ISO and white balance as whole numbers, with or without the K', () => {
		expect(readTakeValue('isoSpeed', '800', fps24)).toBe(800);
		expect(readTakeValue('isoSpeed', '1280.0', fps24)).toBe(1280);
		expect(readTakeValue('whiteBalance', '5600K', fps24)).toBe(5600);
		expect(readTakeValue('whiteBalance', '4300 K', fps24)).toBe(4300);
		expect(readTakeValue('whiteBalance', '4300.5', fps24)).toBeNull();
	});

	it('reads a shutter angle, and turns a shutter speed into one at the frame rate', () => {
		expect(readTakeValue('shutterAngle', '180.0', fps24)).toBe(180);
		expect(readTakeValue('shutterAngle', '172.8°', fps24)).toBe(172.8);
		expect(readTakeValue('shutterAngle', '1/50s', fps24)).toBe(172.8);
		expect(readTakeValue('shutterAngle', '1/48', fps24)).toBe(180);
		expect(readTakeValue('shutterAngle', '1/50 s', { num: 25, denom: 1 })).toBe(180);
		expect(readTakeValue('shutterAngle', '1/10s', fps24)).toBeNull();
	});

	it('reads the frame rate as a rational, 23.976 as 24000/1001', () => {
		expect(readTakeValue('captureFrameRate', '25.000', fps24)).toEqual({ num: 25, denom: 1 });
		expect(readTakeValue('captureFrameRate', '23.976', fps24)).toEqual({ num: 24000, denom: 1001 });
		expect(readTakeValue('captureFrameRate', 'fast', fps24)).toBeNull();
	});

	it('reads a focal length in mm', () => {
		expect(readTakeValue('focalLength', '32mm', fps24)).toBe(32);
		expect(readTakeValue('focalLength', '85.0 mm', fps24)).toBe(85);
	});

	it('reads an empty cell, a dash or a zero as no value', () => {
		for (const text of ['', ' ', '-', '—', '0', '0.0', 'n/a']) expect(readTakeValue('tStop', text, fps24)).toBeUndefined();
		expect(readTakeValue('isoSpeed', '0', fps24)).toBeUndefined();
	});

	it('is null for a value it cannot read or the catalogue refuses', () => {
		expect(readTakeValue('tStop', 'wide open', fps24)).toBeNull();
		expect(readTakeValue('shutterAngle', '400', fps24)).toBeNull();
		expect(readTakeValue('isoSpeed', '-200', fps24)).toBeNull();
	});
});
