import { describe, expect, it } from 'vitest';
import { previewTable, readAle } from './preview';

describe('readAle', () => {
	it('reads the Column line and the Data lines', () => {
		const text = 'Heading\nFIELD_DELIM\tTABS\nFPS\t24\n\nColumn\nName\tStart\n\nData\nA001\t01:00:00:00\nA002\t01:00:10:00\n';
		expect(readAle(text)).toEqual([
			['Name', 'Start'],
			['A001', '01:00:00:00'],
			['A002', '01:00:10:00']
		]);
	});
	it('reads a file with no data', () => {
		expect(readAle('Heading\n\nColumn\nName\n\nData\n')).toEqual([['Name']]);
	});
});

describe('previewTable', () => {
	it('gives the header, the first rows and the count', () => {
		const p = previewTable('crif', 'h1,h2\r\n1,2\r\n3,4\r\n5,6\r\n', 2);
		expect(p).toEqual({ header: ['h1', 'h2'], rows: [['1', '2'], ['3', '4']], total: 3 });
	});
	it('reads an ALE', () => {
		expect(previewTable('ale', 'Column\nName\n\nData\nA\n', 5)).toEqual({ header: ['Name'], rows: [['A']], total: 1 });
	});
	it('reads quotes and commas in a cell, and a byte order mark', () => {
		expect(previewTable('plainCsv', '﻿a,b\r\n"x, ""y""",2\r\n', 5)).toEqual({ header: ['a', 'b'], rows: [['x, "y"', '2']], total: 1 });
	});
	it('shows the vertical tab between Set Media values as a dot', () => {
		expect(previewTable('crif', 'a\r\n"Balls\vHDRI"\r\n', 5).rows).toEqual([['Balls · HDRI']]);
	});
});
