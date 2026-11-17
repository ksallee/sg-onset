import { describe, expect, it } from 'vitest';
import type { Lens } from '$lib/model/types';
import { lensKey, matchLens } from './lens';

const lens = (id: string, lensMake: string | undefined, lensModel: string, extra: Partial<Lens> = {}): Lens => ({ id, projectId: 'p', lensMake, lensModel, ...extra });
const cooke32 = lens('c32', 'Cooke', 'S4/i 32mm');
const cooke50 = lens('c50', 'Cooke', 'S4/i 50mm');
const optimo = lens('opt', 'Angénieux', 'Optimo 24-290', { focalLength: 24, focalLengthMax: 290 });
const gear = [cooke32, cooke50, optimo];

describe('lensKey', () => {
	it('compares without case, spaces or punctuation', () => {
		expect(lensKey(' Cooke S4/i 32mm ')).toBe(lensKey('cooke s4i 32 MM'));
		expect(lensKey('Ultra Prime 32')).toBe(lensKey('UltraPrime-32'));
		expect(lensKey('Angénieux')).toBe(lensKey('angenieux'));
		expect(lensKey('S4/i 32mm')).not.toBe(lensKey('S4/i 35mm'));
	});
});

describe('matchLens', () => {
	it('finds the lens by its model', () => {
		expect(matchLens('S4/i 32mm', gear)).toEqual({ kind: 'one', lens: cooke32 });
	});
	it('finds the lens by its name: make and model', () => {
		expect(matchLens('COOKE S4/I 32MM', gear)).toEqual({ kind: 'one', lens: cooke32 });
		expect(matchLens('Angenieux Optimo 24-290', gear)).toEqual({ kind: 'one', lens: optimo });
	});
	it('finds none for a lens the project does not have', () => {
		expect(matchLens('Panavision PRIMO_ZOO', gear)).toEqual({ kind: 'none' });
		expect(matchLens('S4/i', gear)).toEqual({ kind: 'none' });
	});
	it('finds many when two lenses answer to the name', () => {
		const twin = lens('c32b', 'Cooke', 'S4/i 32mm', { lensSerialNumber: '222' });
		expect(matchLens('Cooke S4/i 32mm', [...gear, twin])).toEqual({ kind: 'many', lenses: [cooke32, twin] });
	});
	it('reads nothing in an empty name', () => {
		expect(matchLens('  ', gear)).toEqual({ kind: 'none' });
	});
});
