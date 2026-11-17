import { describe, expect, it } from 'vitest';
import { referenceSlatesWrite } from './referenceSlates';

describe('referenceSlatesWrite', () => {
	it('sets the slates a reference shows on, each once, in order, when the field holds others', () => {
		expect(referenceSlatesWrite([7, 3, 3], [])).toEqual([3, 7]);
		expect(referenceSlatesWrite([3, 7, 9], [3, 7])).toEqual([3, 7, 9]);
		expect(referenceSlatesWrite([3], [3, 7])).toEqual([3]);
	});

	it('writes nothing when the field holds them already, in any order', () => {
		expect(referenceSlatesWrite([7, 3], [3, 7])).toBeUndefined();
		expect(referenceSlatesWrite([], [])).toBeUndefined();
	});

	// Kevin, #107: derived as a slate's Shots are (#102). A slate a person linked by hand goes.
	it('overwrites a slate linked by hand in Flow PT', () => {
		expect(referenceSlatesWrite([3, 7], [3, 7, 99])).toEqual([3, 7]);
	});
});
