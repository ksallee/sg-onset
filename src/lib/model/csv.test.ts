import { describe, expect, it } from 'vitest';
import { parseCsv, sniffDelimiter } from './csv';

describe('parseCsv', () => {
	it('splits rows and cells', () => {
		expect(parseCsv('a,b,c\n1,2,3')).toEqual([
			['a', 'b', 'c'],
			['1', '2', '3']
		]);
	});

	it('reads CRLF, CR and LF line ends, and ignores a final one', () => {
		expect(parseCsv('a,b\r\n1,2\r3,4\n')).toEqual([
			['a', 'b'],
			['1', '2'],
			['3', '4']
		]);
	});

	it('reads quoted cells with commas, quotes and line breaks inside', () => {
		expect(parseCsv('name,note\n"Optimo 24-290, T2.8","6"" tall\nline two"')).toEqual([
			['name', 'note'],
			['Optimo 24-290, T2.8', '6" tall\nline two']
		]);
	});

	it('trims cells outside quotes and keeps spaces inside them', () => {
		expect(parseCsv(' a , " b " ')).toEqual([['a', ' b ']]);
	});

	it('keeps empty cells and blank lines', () => {
		expect(parseCsv('a,,c\n\n,')).toEqual([['a', '', 'c'], [''], ['', '']]);
	});

	it('drops a byte order mark', () => {
		expect(parseCsv('﻿a,b')).toEqual([['a', 'b']]);
	});

	it('reads semicolons and tabs when they are the delimiter', () => {
		expect(parseCsv('a;b;c\n1,5;2;3')).toEqual([
			['a', 'b', 'c'],
			['1,5', '2', '3']
		]);
		expect(parseCsv('a\tb\n1\t2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('never throws: an open quote runs to the end, text after a closing quote is kept', () => {
		expect(parseCsv('a,"b,c\nd')).toEqual([['a', 'b,c\nd']]);
		expect(parseCsv('"a"b,c')).toEqual([['ab', 'c']]);
		expect(parseCsv('')).toEqual([]);
	});

	it('takes a quote inside an unquoted cell as text: 2/3" is a sensor size', () => {
		expect(parseCsv('a,2/3",b\nc,1",d')).toEqual([
			['a', '2/3"', 'b'],
			['c', '1"', 'd']
		]);
	});
});

describe('sniffDelimiter', () => {
	it('picks the commonest of comma, semicolon and tab on the first line, outside quotes', () => {
		expect(sniffDelimiter('a,b,c')).toBe(',');
		expect(sniffDelimiter('a;b;c\n1,2,3,4,5')).toBe(';');
		expect(sniffDelimiter('"a,b,c";d;e')).toBe(';');
		expect(sniffDelimiter('a\tb')).toBe('\t');
		expect(sniffDelimiter('abc')).toBe(',');
	});

	it('skips title lines with no delimiter', () => {
		expect(sniffDelimiter('Gear list\n\nMake;Model;Focal\nCooke;S4, 32;32')).toBe(';');
		expect(sniffDelimiter('Sony 2/3" bodies\nMake\tModel')).toBe('\t');
	});
});
