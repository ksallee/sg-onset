import { describe, expect, it } from 'vitest';
import { readSheet } from './sheet';
import { SILVERSTACK_COLUMNS, silverstackAle } from './testFiles';

describe('readSheet', () => {
	it('reads an ALE as a sheet, with its heading', () => {
		const sheet = readSheet(silverstackAle([{ name: 'A001C001', start: '10:00:00:00' }]))!;
		expect(sheet.format).toBe('ale');
		expect(sheet.headers).toEqual(SILVERSTACK_COLUMNS);
		expect(sheet.heading.FPS).toBe('24');
		expect(sheet.headerRow).toBe(7);
		expect(sheet.rows).toHaveLength(1);
	});

	it('reads a CSV and finds the header under title lines by its known names', () => {
		const text = ['Camera report, Day 12', 'Unit,Main', '', 'Slate,Take,Clip Name,Roll,TC In,TC Out', '42A,1,A001C001,A001,10:00:00:00,10:00:48:00', '', '42A,2,A001C002,A001,10:02:00:00,10:02:40:00'].join('\n');
		const sheet = readSheet(text)!;
		expect(sheet.format).toBe('csv');
		expect(sheet.heading).toEqual({});
		expect(sheet.headerRow).toBe(4);
		expect(sheet.headers).toEqual(['Slate', 'Take', 'Clip Name', 'Roll', 'TC In', 'TC Out']);
		expect(sheet.rows).toEqual([
			{ line: 5, cells: ['42A', '1', 'A001C001', 'A001', '10:00:00:00', '10:00:48:00'] },
			{ line: 7, cells: ['42A', '2', 'A001C002', 'A001', '10:02:00:00', '10:02:40:00'] }
		]);
	});

	it('reads semicolons and tabs', () => {
		expect(readSheet('Clip;Roll\nA001C001;A001')!.rows[0].cells).toEqual(['A001C001', 'A001']);
		expect(readSheet('Clip\tRoll\nA001C001\tA001')!.rows[0].cells).toEqual(['A001C001', 'A001']);
	});

	it('takes the first row of two cells or more as the header when no name is known', () => {
		const sheet = readSheet('Plates for the day\nFichier,Bobine,Début\nA001C001,A001,10:00:00:00')!;
		expect(sheet.headerRow).toBe(2);
		expect(sheet.headers).toEqual(['Fichier', 'Bobine', 'Début']);
		expect(sheet.rows).toHaveLength(1);
	});

	it('is null for an empty file or one with no columns', () => {
		expect(readSheet('')).toBeNull();
		expect(readSheet('  \n\n')).toBeNull();
		expect(readSheet('Just a note\nNothing else')).toBeNull();
	});
});
