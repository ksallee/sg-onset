import { describe, expect, it } from 'vitest';
import { fieldsOf } from '$lib/model/catalogue';
import { parseCsv } from '$lib/model/csv';
import { importCameras, importLenses } from '$lib/model/gearImport';
import { csvCell, sampleCsv, sampleFileName, samplePlaceholder, toCsv } from './sampleCsv';

const options = () => {
	let n = 0;
	return { projectId: 'p', newId: () => `id${++n}` };
};

describe('csvCell', () => {
	it('quotes a cell with a comma, a quote, a line end or spaces around', () => {
		expect(csvCell('plain')).toBe('plain');
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('2/3" mount')).toBe('"2/3"" mount"');
		expect(csvCell('two\nlines')).toBe('"two\nlines"');
		expect(csvCell(' pad')).toBe('" pad"');
	});
});

describe('toCsv', () => {
	it('joins rows with line ends and reads back as it was', () => {
		const rows = [['a', 'b,c'], ['d"', '']];
		expect(parseCsv(toCsv(rows))).toEqual(rows);
	});
});

describe('sampleCsv', () => {
	it('has the catalogue keys of the scope as its header, a zoom’s long end in its own column', () => {
		expect(parseCsv(sampleCsv('camera'))[0]).toEqual(fieldsOf('camera').map((d) => d.key));
		expect(parseCsv(sampleCsv('lens'))[0]).toEqual(fieldsOf('lens').map((d) => d.key));
		expect(sampleCsv('lens')).toContain(',24,290,');
		expect(sampleCsv('lens')).not.toContain(',24-290,');
	});
	it('imports cleanly: every column read, every row a record, no issue', () => {
		const cams = importCameras(sampleCsv('camera'), options());
		expect(cams.report.ignoredColumns).toEqual([]);
		expect(cams.report.issues).toEqual([]);
		expect(cams.records.length).toBeGreaterThan(1);
		expect(cams.records.every((r) => r.activeSensorPhysicalDimensions && r.activeSensorResolution)).toBe(true);

		const lenses = importLenses(sampleCsv('lens'), options());
		expect(lenses.report.ignoredColumns).toEqual([]);
		expect(lenses.report.issues).toEqual([]);
		expect(lenses.records.some((r) => r.focalLengthMax !== undefined)).toBe(true);
		expect(lenses.records.some((r) => r.anamorphicSqueeze !== undefined)).toBe(true);
	});
});

describe('samplePlaceholder', () => {
	it('is the sample’s header and its first rows, for both kinds', () => {
		for (const scope of ['camera', 'lens'] as const) {
			const shown = parseCsv(samplePlaceholder(scope));
			const sample = parseCsv(sampleCsv(scope));
			expect(shown[0]).toEqual(sample[0]);
			expect(shown.length).toBeGreaterThan(1);
			expect(shown.length).toBeLessThanOrEqual(3);
			expect(shown).toEqual(sample.slice(0, shown.length));
		}
	});
	it('imports cleanly, as typed', () => {
		expect(importCameras(samplePlaceholder('camera'), options()).report.issues).toEqual([]);
		expect(importLenses(samplePlaceholder('lens'), options()).report.issues).toEqual([]);
	});
});

describe('sampleFileName', () => {
	it('names the file by its kind', () => {
		expect(sampleFileName('camera')).toBe('sg-onset-cameras-sample.csv');
		expect(sampleFileName('lens')).toBe('sg-onset-lenses-sample.csv');
	});
});
