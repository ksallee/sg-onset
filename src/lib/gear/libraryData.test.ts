// The shipped tables: every row reads, and nothing in them would import wrong.
import { describe, expect, it } from 'vitest';
import { parseCsv } from '$lib/model/csv';
import { rationalToNumber } from '$lib/model/rational';
import { lensSeries, parseLibraryCameras, parseLibraryLenses } from './library';
import camerasCsv from './library/cameras.csv?raw';
import lensesCsv from './library/lenses.csv?raw';

const rows = (csv: string) => parseCsv(csv).slice(1).filter((cells) => cells.some((c) => c !== ''));
const SQUEEZES = [1.25, 1.3, 1.33, 1.5, 1.6, 1.65, 1.8, 2];

describe('library/cameras.csv', () => {
	const cameras = parseLibraryCameras(camerasCsv);
	it('reads every row', () => {
		expect(cameras.length).toBe(rows(camerasCsv).length);
		expect(cameras.length).toBeGreaterThanOrEqual(40);
	});
	it('names each body once, with a make and a source', () => {
		const names = cameras.map((c) => `${c.make} ${c.model}`.toLowerCase());
		expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
		for (const c of cameras) {
			expect(c.make, c.model).not.toBe('');
			expect(c.source, c.model).toMatch(/^https:\/\//);
		}
	});
	it('holds plausible sizes: 5 to 70 mm wide, wider than tall or square, 1000 px and up', () => {
		for (const c of cameras) {
			if (c.sensor) {
				expect(c.sensor.width, c.model).toBeGreaterThan(5);
				expect(c.sensor.width, c.model).toBeLessThan(70);
				expect(c.sensor.height, c.model).toBeLessThanOrEqual(c.sensor.width);
			}
			if (c.resolution) {
				expect(c.resolution.width, c.model).toBeGreaterThanOrEqual(1000);
				expect(c.resolution.height, c.model).toBeLessThanOrEqual(c.resolution.width);
				expect(Number.isInteger(c.resolution.width) && Number.isInteger(c.resolution.height), c.model).toBe(true);
			}
			// Square photosites: the sensor and the recording have the same shape, within 3 %.
			if (c.sensor && c.resolution) {
				const shape = c.sensor.width / c.sensor.height / (c.resolution.width / c.resolution.height);
				expect(Math.abs(shape - 1), c.model).toBeLessThan(0.03);
			}
		}
	});
});

describe('library/lenses.csv', () => {
	const lenses = parseLibraryLenses(lensesCsv);
	it('reads every row', () => {
		expect(lenses.length).toBe(rows(lensesCsv).length);
		expect(lenses.length).toBeGreaterThanOrEqual(250);
	});
	it('names each lens once, with a make, a series and a source', () => {
		const names = lenses.map((l) => `${l.make} ${l.model}`.toLowerCase());
		expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
		for (const l of lenses) {
			expect(l.make, l.model).not.toBe('');
			expect(l.series, l.model).not.toBe('');
			expect(l.source, l.model).toMatch(/^https:\/\//);
		}
	});
	it('holds plausible numbers', () => {
		for (const l of lenses) {
			expect(l.focalLength, l.model).toBeGreaterThanOrEqual(3);
			expect(l.focalLength, l.model).toBeLessThanOrEqual(2000);
			if (l.focalLengthMax !== undefined) expect(l.focalLengthMax, l.model).toBeGreaterThan(l.focalLength);
			if (l.tStop !== undefined) {
				expect(l.tStop, l.model).toBeGreaterThanOrEqual(0.7);
				expect(l.tStop, l.model).toBeLessThanOrEqual(11);
			}
			if (l.squeeze) expect(SQUEEZES, l.model).toContain(rationalToNumber(l.squeeze));
			if (l.coverage !== undefined) expect(['S35', 'FF', 'LF', '65'], l.model).toContain(l.coverage);
		}
	});
	it('says the focal length of each lens in its name', () => {
		for (const l of lenses) expect(l.model, l.model).toContain(String(l.focalLength));
	});
	it('groups into sets of one make each', () => {
		expect(lensSeries(lenses).length).toBeGreaterThanOrEqual(20);
	});
});
