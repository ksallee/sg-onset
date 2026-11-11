import { describe, expect, it } from 'vitest';
import type { Camera, Lens } from '$lib/model/types';
import { cameraLine, countText, focalBadge, focalText, lensLine, rowIssueText } from './text';

const lens = (rest: Partial<Lens>): Lens => ({ id: 'l', projectId: 'p', ...rest });

describe('countText', () => {
	it('says one and many', () => {
		expect(countText('lens', 1)).toBe('1 lens');
		expect(countText('lens', 3)).toBe('3 lenses');
		expect(countText('camera', 0)).toBe('0 cameras');
		expect(countText('cameraSetup', 2)).toBe('2 camera setups');
	});
});

describe('focalText', () => {
	it('gives a prime’s focal length and a zoom’s range', () => {
		expect(focalText(lens({ focalLength: 32 }))).toBe('32 mm');
		expect(focalText(lens({ focalLength: 24, focalLengthMax: 290 }))).toBe('24–290 mm');
		expect(focalText(lens({}))).toBe('');
	});
});

describe('lensLine', () => {
	it('says the kind, the focal length, the squeeze and the serial number', () => {
		expect(lensLine(lens({ focalLength: 40, anamorphicSqueeze: { num: 2, denom: 1 }, lensSerialNumber: 'H1' }))).toBe('Prime · 40 mm · 2× anamorphic · SN H1');
		expect(lensLine(lens({ focalLength: 24, focalLengthMax: 290 }))).toBe('Zoom · 24–290 mm');
		expect(lensLine(lens({}))).toBe('No focal length');
	});
});

describe('cameraLine', () => {
	it('says the sensor size, the resolution and the serial number', () => {
		const cam: Camera = { id: 'c', projectId: 'p', cameraSerialNumber: 'K1', activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 }, activeSensorResolution: { width: 4608, height: 3164 } };
		expect(cameraLine(cam)).toBe('27.99 × 19.22 mm · 4608 × 3164 px · SN K1');
		expect(cameraLine({ id: 'c', projectId: 'p' })).toBe('');
	});
});


describe('focalBadge', () => {
	it('is the focal length bare, a range, or a dash', () => {
		expect(focalBadge(lens({ focalLength: 32 }))).toBe('32');
		expect(focalBadge(lens({ focalLength: 24, focalLengthMax: 290 }))).toBe('24–290');
		expect(focalBadge(lens({}))).toBe('–');
	});
});

describe('rowIssueText', () => {
	it('says what went wrong without the row number, which the list shows beside it', () => {
		expect(rowIssueText({ key: 'import.badValue', row: 4, column: 'Focal', value: 'wide' })).toBe('Focal: “wide” could not be read. The value was left out.');
		expect(rowIssueText({ key: 'import.missingModel', row: 3 })).toBe('No model. The row was left out.');
		for (const key of ['missingModel', 'badValue', 'incompleteSize', 'noFocalLength', 'focalConflict']) {
			expect(rowIssueText({ key: `import.${key}`, row: 7, column: 'Width', value: '36' })).not.toMatch(/Row|\{|\}/);
		}
	});
	it('falls back to the full message for a key with no short form', () => {
		expect(rowIssueText({ key: 'import.noHeader', row: 0 })).toMatch(/^No header row/);
	});
});
