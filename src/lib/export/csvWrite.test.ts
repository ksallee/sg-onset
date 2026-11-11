import { describe, expect, it } from 'vitest';
import { parseCsv } from '$lib/model/csv';
import { BOM, csvCell, csvText, guardFormula } from './csvWrite';

describe('csvCell', () => {
	it('leaves a plain cell bare', () => {
		expect(csvCell('A001')).toBe('A001');
		expect(csvCell('')).toBe('');
	});

	it('quotes a cell with a comma, a quote or a line break, doubling quotes (RFC 4180)', () => {
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('6\' 3"')).toBe('"6\' 3"""');
		expect(csvCell('two\nlines')).toBe('"two\nlines"');
		expect(csvCell('cr\r')).toBe('"cr\r"');
	});

	it('quotes a cell with space at either end, so it survives a trimming reader', () => {
		expect(csvCell(' lead')).toBe('" lead"');
	});
});

describe('guardFormula', () => {
	it('puts a quote before text a spreadsheet would run', () => {
		expect(guardFormula('=SUM(A1)')).toBe("'=SUM(A1)");
		expect(guardFormula('+cmd')).toBe("'+cmd");
		expect(guardFormula('-2+3')).toBe("'-2+3");
		expect(guardFormula('@SUM(1)')).toBe("'@SUM(1)");
		expect(guardFormula('\t=1')).toBe("'\t=1");
	});

	it('leaves numbers alone, signed ones included', () => {
		expect(guardFormula('-5')).toBe('-5');
		expect(guardFormula('+10')).toBe('+10');
		expect(guardFormula('-0.25')).toBe('-0.25');
		expect(guardFormula('A=1')).toBe('A=1');
	});

	it('leaves a signed number with a short unit alone, and not a formula dressed as one', () => {
		expect(guardFormula('-5°')).toBe('-5°');
		expect(guardFormula('-5 mm')).toBe('-5 mm');
		expect(guardFormula('-5+cmd')).toBe("'-5+cmd");
		expect(guardFormula('-5 mm()')).toBe("'-5 mm()");
	});
});

describe('csvText', () => {
	it('joins rows with CRLF and ends with one', () => {
		expect(csvText([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2\r\n');
	});

	it('adds a byte order mark on request', () => {
		expect(csvText([['a']], { bom: true })).toBe(`${BOM}a\r\n`);
	});

	it('guards formulas on request', () => {
		expect(csvText([['=1', '-5']], { guardFormulas: true })).toBe("'=1,-5\r\n");
	});

	it('reads back through the model CSV reader', () => {
		const rows = [['Slate', 'Notes'], ['42A', 'He said "cut", then\nleft'], ['9', 'a,b']];
		expect(parseCsv(csvText(rows))).toEqual(rows);
	});
});
