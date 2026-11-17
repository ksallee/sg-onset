import { describe, expect, it } from 'vitest';
import { currentCode, pickCode, suggestCodes } from './shotSuggest';

const CODES = ['SMP_009_0010', 'SMP_012_0010', 'SMP_012_0020', 'SMP_012_0030', 'SMP_042_0010', 'TST_012_0010'];

describe('currentCode', () => {
	it('is the code being typed: what follows the last separator', () => {
		expect(currentCode('SMP_012_0010, smp_01')).toBe('smp_01');
		expect(currentCode('SMP_012_0010;SMP_04')).toBe('SMP_04');
		expect(currentCode('SMP_012_0010, ')).toBe('');
		expect(currentCode('')).toBe('');
	});
});

describe('suggestCodes', () => {
	it('offers the codes that start with what is typed, whatever the case', () => {
		expect(suggestCodes('smp_012', CODES)).toEqual(['SMP_012_0010', 'SMP_012_0020', 'SMP_012_0030']);
	});

	it('offers the codes that hold it after those that start with it', () => {
		expect(suggestCodes('012_0010', CODES)).toEqual(['SMP_012_0010', 'TST_012_0010']);
		expect(suggestCodes('0010', CODES, 3)).toEqual(['SMP_009_0010', 'SMP_012_0010', 'SMP_042_0010']);
	});

	it('leaves out the codes already typed on the slate', () => {
		expect(suggestCodes('SMP_012_0010, SMP_012_0020, smp_012', CODES)).toEqual(['SMP_012_0030']);
	});

	it('offers nothing until a character is typed, nor for a code typed in full', () => {
		expect(suggestCodes('', CODES)).toEqual([]);
		expect(suggestCodes('SMP_012_0010, ', CODES)).toEqual([]);
		expect(suggestCodes('smp_042_0010', CODES)).toEqual([]);
	});

	it('offers at most six', () => {
		expect(suggestCodes('SMP', CODES).length).toBe(5);
		expect(suggestCodes('0', CODES).length).toBe(6);
	});
});

describe('pickCode', () => {
	it('puts the picked code in place of the one being typed', () => {
		expect(pickCode('SMP_012_0010, smp_04', 'SMP_042_0010')).toBe('SMP_012_0010, SMP_042_0010');
		expect(pickCode('smp_04', 'SMP_042_0010')).toBe('SMP_042_0010');
		expect(pickCode('SMP_012_0010,', 'SMP_042_0010')).toBe('SMP_012_0010, SMP_042_0010');
	});
});
