// The shipped tables: every row reads, and nothing in them would import wrong.
import { describe, expect, it } from 'vitest';
import { parseCsv } from '$lib/model/csv';
import { rationalToNumber } from '$lib/model/rational';
import { lensSeries, parseLibraryCameras, parseLibraryLenses } from './library';
import camerasCsv from './library/cameras.csv?raw';
import modesCsv from './library/camera-modes.csv?raw';
import lensesCsv from './library/lenses.csv?raw';

const rows = (csv: string) => parseCsv(csv).slice(1).filter((cells) => cells.some((c) => c !== ''));
const SQUEEZES = [1.25, 1.3, 1.33, 1.5, 1.6, 1.65, 1.8, 2];

describe('library/cameras.csv and camera-modes.csv', () => {
	const cameras = parseLibraryCameras(camerasCsv, modesCsv);
	const modes = cameras.flatMap((c) => c.modes.map((m, i) => ({ c, m, i, label: `${c.model} / ${m.name ?? 'full'}` })));
	it('reads every row: each mode row names a body of cameras.csv', () => {
		expect(cameras.length).toBe(rows(camerasCsv).length);
		expect(cameras.length).toBeGreaterThanOrEqual(40);
		expect(modes.length).toBe(rows(camerasCsv).length + rows(modesCsv).length);
	});
	it('names each body once and each of its modes once, with a make and a source', () => {
		const names = cameras.map((c) => `${c.make} ${c.model}`.toLowerCase());
		expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
		for (const c of cameras) {
			expect(c.make, c.model).not.toBe('');
			const own = c.modes.map((m) => (m.name ?? '').toLowerCase());
			expect(own.filter((n, i) => own.indexOf(n) !== i), c.model).toEqual([]);
		}
		for (const { m, i, label } of modes) {
			expect(m.source, label).toMatch(/^https:\/\//);
			if (i > 0) expect(m.name, label).toBeTruthy();
		}
	});
	it('holds plausible sizes: 3 to 70 mm wide, 1000 px and up, the sensor shaped as the recording', () => {
		for (const { m, label } of modes) {
			if (m.sensor) {
				expect(m.sensor.width, label).toBeGreaterThan(3);
				expect(m.sensor.width, label).toBeLessThan(70);
			}
			if (m.resolution) {
				expect(m.resolution.width, label).toBeGreaterThanOrEqual(1000);
				expect(Number.isInteger(m.resolution.width) && Number.isInteger(m.resolution.height), label).toBe(true);
			}
			// Square photosites: the sensor and the recording have the same shape, within 3 %.
			if (m.sensor && m.resolution) {
				const shape = m.sensor.width / m.sensor.height / (m.resolution.width / m.resolution.height);
				expect(Math.abs(shape - 1), label).toBeLessThan(0.03);
			}
		}
	});
	it('no mode reads more sensor than the full sensor', () => {
		for (const { c, m, i, label } of modes) {
			const full = c.modes[0].sensor;
			if (i === 0 || !full || !m.sensor) continue;
			expect(m.sensor.width, label).toBeLessThanOrEqual(full.width * 1.01);
			expect(m.sensor.height, label).toBeLessThanOrEqual(full.height * 1.01);
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
