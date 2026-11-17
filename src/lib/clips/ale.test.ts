import { describe, expect, it } from 'vitest';
import { isAle, parseAle } from './ale';
import { ARRI_COLUMNS, AVID_COLUMNS, SILVERSTACK_COLUMNS, arriAle, avidAle, silverstackAle } from './testFiles';

const clip = { name: 'A001C003_261117_S8XY', roll: 'A001', camera: 'A', start: '14:02:11:04', end: '14:02:59:10', duration: '00:00:48:06' };

describe('isAle', () => {
	it('knows an ALE by its Heading, Column and Data lines', () => {
		expect(isAle(silverstackAle([clip]))).toBe(true);
		expect(isAle(avidAle([clip]))).toBe(true);
		expect(isAle('﻿\n\nHeading\nFPS\t24\n\nColumn\nName\n\nData\nA001C001\n')).toBe(true);
	});
	it('is false for a CSV or plain text', () => {
		expect(isAle('Name,Start,End\nA001C001,10:00:00:00,10:00:01:00')).toBe(false);
		expect(isAle('')).toBe(false);
		expect(isAle('Heading only')).toBe(false);
	});
});

describe('parseAle', () => {
	it('reads the heading, the columns and the rows of a Silverstack file', () => {
		const ale = parseAle(silverstackAle([clip, { ...clip, name: 'A001C004_261117_S8XY' }]))!;
		expect(ale.heading).toEqual({ FIELD_DELIM: 'TABS', VIDEO_FORMAT: '1080', FPS: '24' });
		expect(ale.headers).toEqual(SILVERSTACK_COLUMNS);
		expect(ale.rows).toHaveLength(2);
		const name = SILVERSTACK_COLUMNS.indexOf('Name');
		expect(ale.rows.map((r) => r.cells[name])).toEqual(['A001C003_261117_S8XY', 'A001C004_261117_S8XY']);
		expect(ale.rows.map((r) => r.line)).toEqual([10, 11]);
	});

	it('reads an ARRI file with its own column names', () => {
		const ale = parseAle(arriAle([clip]))!;
		expect(ale.heading.FPS).toBe('25');
		expect(ale.headers).toEqual(ARRI_COLUMNS);
		expect(ale.rows[0].cells[ARRI_COLUMNS.indexOf('Reel_name')]).toBe('A001');
	});

	it('reads the carriage returns of an Avid file and trims padded cells', () => {
		const ale = parseAle(avidAle([clip]))!;
		expect(ale.headers).toEqual(AVID_COLUMNS);
		expect(ale.rows[0].cells[0]).toBe('');
		expect(ale.rows[0].cells[AVID_COLUMNS.indexOf('Name')]).toBe('A001C003_261117_S8XY.mov');
	});

	it('reads CRLF, skips blank lines in the data and keeps short rows', () => {
		const text = ['Heading', 'FIELD_DELIM\tTABS', 'FPS\t25', '', 'Column', 'Name\tStart\tEnd', '', 'Data', 'A001C001\t10:00:00:00\t10:00:01:00', '', 'A001C002\t10:01:00:00', ''].join('\r\n');
		const ale = parseAle(text)!;
		expect(ale.rows.map((r) => r.cells)).toEqual([
			['A001C001', '10:00:00:00', '10:00:01:00'],
			['A001C002', '10:01:00:00']
		]);
		expect(ale.rows.map((r) => r.line)).toEqual([9, 11]);
	});

	it('has no heading values when the file has none, and no rows without a Data line', () => {
		expect(parseAle('Column\nName\nData\nA001C001\n')).toEqual({ heading: {}, headers: ['Name'], headerLine: 2, rows: [{ line: 4, cells: ['A001C001'] }] });
		expect(parseAle('Heading\nFPS\t24\nColumn\nName\n')).toBeNull();
		expect(parseAle('Name,Start\nA,B')).toBeNull();
	});
});
