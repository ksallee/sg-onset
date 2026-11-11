import { describe, expect, it } from 'vitest';
import type { Camera, Lens } from '$lib/model/types';
import { cameraTitle, focalRange, gearTitle, lensKind, lensTitle } from './names';

const cam = (rest: Partial<Camera>): Camera => ({ id: 'c', projectId: 'p', ...rest });
const lens = (rest: Partial<Lens>): Lens => ({ id: 'l', projectId: 'p', ...rest });

describe('cameraTitle', () => {
	it('is the make and the model', () => {
		expect(cameraTitle(cam({ cameraMake: 'ARRI', cameraModel: 'Alexa 35' }))).toBe('ARRI Alexa 35');
	});
	it('does not say the make twice', () => {
		expect(cameraTitle(cam({ cameraMake: 'RED', cameraModel: 'red V-Raptor' }))).toBe('red V-Raptor');
	});
	it('is the model alone, or the make alone, or empty', () => {
		expect(cameraTitle(cam({ cameraModel: ' Venice 2 ' }))).toBe('Venice 2');
		expect(cameraTitle(cam({ cameraMake: 'Sony' }))).toBe('Sony');
		expect(cameraTitle(cam({}))).toBe('');
	});
});

describe('lensTitle', () => {
	it('is the make and the model', () => {
		expect(lensTitle(lens({ lensMake: 'Cooke', lensModel: 'S4/i 32 mm' }))).toBe('Cooke S4/i 32 mm');
	});
});

describe('gearTitle', () => {
	it('names a record of either scope', () => {
		expect(gearTitle('camera', cam({ cameraModel: 'Alexa 35' }))).toBe('Alexa 35');
		expect(gearTitle('lens', lens({ lensModel: 'Optimo' }))).toBe('Optimo');
	});
});

describe('lensKind', () => {
	it('is prime for one focal length, or a long end equal to it', () => {
		expect(lensKind(lens({ focalLength: 32 }))).toBe('prime');
		expect(lensKind(lens({ focalLength: 50, focalLengthMax: 50 }))).toBe('prime');
	});
	it('is zoom for a range', () => {
		expect(lensKind(lens({ focalLength: 24, focalLengthMax: 290 }))).toBe('zoom');
	});
	it('is unknown with no focal length', () => {
		expect(lensKind(lens({}))).toBe('unknown');
		expect(lensKind(lens({ focalLengthMax: 100 }))).toBe('unknown');
	});
});

describe('focalRange', () => {
	it('gives one end for a prime and two for a zoom', () => {
		expect(focalRange(lens({ focalLength: 32 }))).toEqual({ min: 32 });
		expect(focalRange(lens({ focalLength: 32, focalLengthMax: 32 }))).toEqual({ min: 32 });
		expect(focalRange(lens({ focalLength: 24, focalLengthMax: 290 }))).toEqual({ min: 24, max: 290 });
		expect(focalRange(lens({}))).toBeUndefined();
	});
});
