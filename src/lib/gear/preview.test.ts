import { describe, expect, it } from 'vitest';
import type { Camera, Lens } from '$lib/model/types';
import { columnsRead, previewImport, recordsToImport } from './preview';

const ids = () => {
	let n = 0;
	return () => `id${++n}`;
};
const options = () => ({ projectId: 'p', newId: ids() });

const LENSES = ['Make,Model,Serial,Focal,Notes', 'Cooke,S4/i 32,111,32,', ',,222,50,model missing', 'Cooke,S4/i 50,333,fifty,', 'Angénieux,Optimo,444,24-290,', '', 'Cooke,S4/i 32,111,32,again'].join('\n');

describe('previewImport', () => {
	it('gives every data row its fate: ready, warning, dropped or duplicate', () => {
		const p = previewImport('lens', LENSES, [], options());
		expect(p.rows.map((r) => [r.row, r.status])).toEqual([
			[2, 'ready'],
			[3, 'dropped'],
			[4, 'warning'],
			[5, 'ready'],
			[7, 'duplicate']
		]);
		expect(p.counts).toEqual({ rows: 5, ready: 2, warning: 1, dropped: 1, duplicate: 1 });
	});
	it('keeps the record of each row that imports, and the issues of each row', () => {
		const p = previewImport('lens', LENSES, [], options());
		expect(p.rows[0].record).toMatchObject({ lensMake: 'Cooke', lensModel: 'S4/i 32', focalLength: 32, projectId: 'p' });
		expect(p.rows[1].record).toBeUndefined();
		expect(p.rows[1].issues.map((i) => i.key)).toEqual(['import.missingModel']);
		expect(p.rows[2].issues.map((i) => [i.key, i.value])).toEqual([['import.badValue', 'fifty']]);
		expect(p.rows[2].record).toMatchObject({ lensModel: 'S4/i 50' });
		expect((p.rows[2].record as Lens).focalLength).toBeUndefined();
	});
	it('marks a row that is gear already in the project, and says which', () => {
		const existing: Lens[] = [{ id: 'mine', projectId: 'p', lensModel: 'Optimo', lensSerialNumber: '444' }];
		const p = previewImport('lens', LENSES, existing, options());
		expect(p.rows[3]).toMatchObject({ status: 'duplicate', duplicateOf: 'mine', within: false });
		expect(p.rows[4]).toMatchObject({ status: 'duplicate', duplicateOf: p.rows[0].record?.id, within: true });
	});
	it('reports a file with no header and has no rows', () => {
		const p = previewImport('camera', 'just,some,text\n1,2,3', [], options());
		expect(p.rows).toEqual([]);
		expect(p.fileIssues.map((i) => i.key)).toEqual(['import.noHeader']);
		expect(p.counts.rows).toBe(0);
	});
	it('reads cameras too, under a title line', () => {
		const text = 'Gear list, day 1\nCamera,Serial,Sensor\nAlexa 35,K1,27.99 x 19.22\nVenice 2,,36x';
		const p = previewImport('camera', text, [], options());
		expect(p.report.headerRow).toBe(2);
		expect(p.rows.map((r) => r.status)).toEqual(['ready', 'warning']);
		expect((p.rows[0].record as Camera).activeSensorPhysicalDimensions).toEqual({ width: 27.99, height: 19.22 });
	});
	it('takes an empty text as nothing to import', () => {
		const p = previewImport('lens', '  ', [], options());
		expect(p.rows).toEqual([]);
		expect(p.counts.rows).toBe(0);
	});
});

describe('recordsToImport', () => {
	it('takes ready and warning rows, and duplicates only when asked', () => {
		const p = previewImport('lens', LENSES, [], options());
		expect(recordsToImport(p, 'skip').map((r) => (r as Lens).lensModel)).toEqual(['S4/i 32', 'S4/i 50', 'Optimo']);
		expect(recordsToImport(p, 'add').map((r) => (r as Lens).lensModel)).toEqual(['S4/i 32', 'S4/i 50', 'Optimo', 'S4/i 32']);
	});
});

describe('columnsRead', () => {
	it('names each header by the catalogue field it fills', () => {
		const p = previewImport('camera', 'Camera,Sensor W,Sensor H,Res,Colour\nAlexa,1,2,3x4,red', [], options());
		expect(columnsRead(p.report)).toEqual([
			{ header: 'Camera', key: 'cameraModel' },
			{ header: 'Sensor W', key: 'activeSensorPhysicalDimensions' },
			{ header: 'Sensor H', key: 'activeSensorPhysicalDimensions' },
			{ header: 'Res', key: 'activeSensorResolution' }
		]);
		expect(p.report.ignoredColumns).toEqual(['Colour']);
	});
	it('reads a min focal column as the focal length', () => {
		const p = previewImport('lens', 'Lens,Wide,Tele\nOptimo,24,290', [], options());
		expect(columnsRead(p.report).map((c) => c.key)).toEqual(['lensModel', 'focalLength', 'focalLengthMax']);
	});
});
