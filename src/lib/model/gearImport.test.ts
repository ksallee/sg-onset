import { describe, expect, it } from 'vitest';
import { importCameras, importLenses } from './gearImport';
import { isPrime, isZoom } from './take';

/** Ids n1, n2, … in call order. */
const ids = () => {
	let n = 0;
	return { projectId: 'p', newId: () => `n${++n}` };
};

describe('importLenses', () => {
	it('reads primes and zooms from one focal length column', () => {
		const csv = ['Make,Model,Serial,Focal Length,Squeeze', 'ARRI,Master Prime,MP-1234,32,', 'Angenieux,Optimo,OP-77,24-290mm,', 'Cooke,Anamorphic/i,C-9,50 mm,2x'].join('\n');
		const { records, report } = importLenses(csv, ids());
		expect(records).toEqual([
			{ id: 'n1', projectId: 'p', lensMake: 'ARRI', lensModel: 'Master Prime', lensSerialNumber: 'MP-1234', focalLength: 32 },
			{ id: 'n2', projectId: 'p', lensMake: 'Angenieux', lensModel: 'Optimo', lensSerialNumber: 'OP-77', focalLength: 24, focalLengthMax: 290 },
			{ id: 'n3', projectId: 'p', lensMake: 'Cooke', lensModel: 'Anamorphic/i', lensSerialNumber: 'C-9', focalLength: 50, anamorphicSqueeze: { num: 2, denom: 1 } }
		]);
		expect(records.map(isPrime)).toEqual([true, false, true]);
		expect(isZoom(records[1])).toBe(true);
		expect(report).toEqual({
			headerRow: 1,
			columns: { Make: 'lensMake', Model: 'lensModel', Serial: 'lensSerialNumber', 'Focal Length': 'focalLength', Squeeze: 'anamorphicSqueeze' },
			ignoredColumns: [],
			rows: 3,
			imported: 3,
			issues: []
		});
	});

	it('reads the ways a focal range is written', () => {
		const csv = ['lens,focal', 'a,24-70', 'b,24–70', 'c,24 - 70 mm', 'd,24mm-70mm', 'e,24 to 70', 'f,70-24', 'g,"17,5"', 'h,32-32'].join('\n');
		const { records } = importLenses(csv, ids());
		expect(records.map((l) => [l.focalLength, l.focalLengthMax])).toEqual([
			[24, 70],
			[24, 70],
			[24, 70],
			[24, 70],
			[24, 70],
			[24, 70],
			[17.5, undefined],
			[32, undefined]
		]);
	});

	it('reads a focal range from two columns', () => {
		const csv = 'Lens Model,Focal Min (mm),Focal Max (mm)\nOptimo,24,290\nMaster Prime,32,32\nUltra Prime,40,';
		const { records, report } = importLenses(csv, ids());
		expect(records.map((l) => [l.focalLength, l.focalLengthMax])).toEqual([
			[24, 290],
			[32, undefined],
			[40, undefined]
		]);
		expect(report.columns).toEqual({ 'Lens Model': 'lensModel', 'Focal Min (mm)': 'focalLengthMin', 'Focal Max (mm)': 'focalLengthMax' });
	});

	it('knows a column by many names, whatever the case and punctuation', () => {
		const csv = 'MANUFACTURER;lens_type;Serial No.;focal-length (mm);Anamorphic Squeeze\nZEISS;Supreme;S1;85;1.0';
		const { records, report } = importLenses(csv, ids());
		expect(records).toEqual([{ id: 'n1', projectId: 'p', lensMake: 'ZEISS', lensModel: 'Supreme', lensSerialNumber: 'S1', focalLength: 85, anamorphicSqueeze: { num: 1, denom: 1 } }]);
		expect(report.ignoredColumns).toEqual([]);
	});

	it('finds the header under title lines, and skips blank lines', () => {
		const csv = 'Lens list for the show\n\nModel,Focal\n\nMaster Prime,32\n,\nUltra Prime,40\n';
		const { records, report } = importLenses(csv, ids());
		expect(records.map((l) => l.lensModel)).toEqual(['Master Prime', 'Ultra Prime']);
		expect(report.headerRow).toBe(3);
		expect(report.rows).toBe(2);
	});

	it('lists the columns it did not use, a repeated one included', () => {
		const csv = 'Model,Focal,Colour,Model\nMaster Prime,32,black,again';
		const { records, report } = importLenses(csv, ids());
		expect(records[0].lensModel).toBe('Master Prime');
		expect(report.columns).toEqual({ Model: 'lensModel', Focal: 'focalLength' });
		expect(report.ignoredColumns).toEqual(['Colour', 'Model']);
	});

	it('rejects a row with no model and reports it by row', () => {
		const csv = 'Make,Model,Focal\nARRI,,32\nARRI,Master Prime,40';
		const { records, report } = importLenses(csv, ids());
		expect(records).toEqual([{ id: 'n1', projectId: 'p', lensMake: 'ARRI', lensModel: 'Master Prime', focalLength: 40 }]);
		expect(report.rows).toBe(2);
		expect(report.imported).toBe(1);
		expect(report.issues).toEqual([{ row: 2, column: 'Model', key: 'import.missingModel', severity: 'error' }]);
	});

	it('imports a row with a bad cell without that value, and warns', () => {
		const csv = 'Model,Focal,Squeeze\nMaster Prime,wide,2x\nUltra Prime,0,very\nOptimo,,';
		const { records, report } = importLenses(csv, ids());
		expect(records).toEqual([
			{ id: 'n1', projectId: 'p', lensModel: 'Master Prime', anamorphicSqueeze: { num: 2, denom: 1 } },
			{ id: 'n2', projectId: 'p', lensModel: 'Ultra Prime' },
			{ id: 'n3', projectId: 'p', lensModel: 'Optimo' }
		]);
		expect(report.issues).toEqual([
			{ row: 2, column: 'Focal', key: 'import.badValue', value: 'wide', severity: 'warning' },
			{ row: 3, column: 'Focal', key: 'import.badValue', value: '0', severity: 'warning' },
			{ row: 3, column: 'Squeeze', key: 'import.badValue', value: 'very', severity: 'warning' },
			{ row: 4, key: 'import.noFocalLength', severity: 'warning' }
		]);
		expect(report.imported).toBe(3);
	});

	it('reads spherical as a squeeze of 1', () => {
		const { records } = importLenses('Model,Focal,Squeeze\nMaster Prime,32,Spherical', ids());
		expect(records[0].anamorphicSqueeze).toEqual({ num: 1, denom: 1 });
	});

	it('reports a text with no header and imports nothing', () => {
		for (const text of ['', 'just some words\nand more', 'ARRI,Master Prime,32']) {
			expect(importLenses(text, ids())).toEqual({
				records: [],
				report: { headerRow: null, columns: {}, ignoredColumns: [], rows: 0, imported: 0, issues: [{ row: 0, key: 'import.noHeader', severity: 'error' }] }
			});
		}
	});

	it('never throws on a broken file', () => {
		expect(() => importLenses('Model,Focal\n"Master Prime,32\n\u0000,,,,"', ids())).not.toThrow();
	});
});

describe('importCameras', () => {
	it('reads bodies with sensor size and resolution in one cell each', () => {
		const csv = ['Manufacturer,Camera Model,Serial Number,Sensor Size (mm),Resolution', 'ARRI,ALEXA 35,K1.0003873,27.99 x 19.22,4608x3164', 'RED,V-RAPTOR,R-55,,'].join('\r\n');
		const { records, report } = importCameras(csv, ids());
		expect(records).toEqual([
			{
				id: 'n1',
				projectId: 'p',
				cameraMake: 'ARRI',
				cameraModel: 'ALEXA 35',
				cameraSerialNumber: 'K1.0003873',
				activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 },
				activeSensorResolution: { width: 4608, height: 3164 }
			},
			{ id: 'n2', projectId: 'p', cameraMake: 'RED', cameraModel: 'V-RAPTOR', cameraSerialNumber: 'R-55' }
		]);
		expect(report).toMatchObject({ headerRow: 1, rows: 2, imported: 2, issues: [], ignoredColumns: [] });
	});

	it('reads sensor size and resolution from width and height columns', () => {
		const csv = 'Body,Sensor Width,Sensor Height,Res Width,Res Height\nALEXA 35,27.99,19.22,4608,3164\nVENICE 2,35.9,,8640,5760';
		const { records, report } = importCameras(csv, ids());
		expect(records[0]).toMatchObject({ activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 }, activeSensorResolution: { width: 4608, height: 3164 } });
		expect(records[1]).toEqual({ id: 'n2', projectId: 'p', cameraModel: 'VENICE 2', activeSensorResolution: { width: 8640, height: 5760 } });
		expect(report.issues).toEqual([{ row: 3, column: 'Sensor Width', key: 'import.incompleteSize', value: '35.9', severity: 'warning' }]);
	});

	it('rejects a row with no model, warns on a bad cell', () => {
		const csv = 'Make,Model,Resolution\nARRI,,4608x3164\nSony,VENICE 2,8.6K';
		const { records, report } = importCameras(csv, ids());
		expect(records).toEqual([{ id: 'n1', projectId: 'p', cameraMake: 'Sony', cameraModel: 'VENICE 2' }]);
		expect(report.issues).toEqual([
			{ row: 2, column: 'Model', key: 'import.missingModel', severity: 'error' },
			{ row: 3, column: 'Resolution', key: 'import.badValue', value: '8.6K', severity: 'warning' }
		]);
	});

	it('reports a column named like an Object prototype key as ignored', () => {
		const { report } = importCameras('Make,Model,Constructor\nARRI,ALEXA 35,x', ids());
		expect(report.columns).toEqual({ Make: 'cameraMake', Model: 'cameraModel' });
		expect(report.ignoredColumns).toEqual(['Constructor']);
	});

	it('finds a semicolon header under a title line', () => {
		const { records, report } = importCameras('Camera list\nMake;Model;Sensor\nSony;HDC-5500;2/3"\nARRI;ALEXA 35;27.99 x 19.22', ids());
		expect(report.headerRow).toBe(2);
		expect(records.map((r) => r.cameraModel)).toEqual(['HDC-5500', 'ALEXA 35']);
		expect(report.issues).toEqual([{ row: 3, column: 'Sensor', key: 'import.badValue', value: '2/3"', severity: 'warning' }]);
	});

	it('does not take a lens file for a camera file', () => {
		expect(importCameras('Lens,Focal\nMaster Prime,32', ids()).report.headerRow).toBeNull();
	});
});
