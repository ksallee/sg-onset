import { describe, expect, it } from 'vitest';
import type { Camera, CameraSetup, Lens } from '$lib/model/types';
import { matchesQuery, normalise, searchCameras, searchLenses, searchSetups, sortCameras, sortLenses } from './list';

const cam = (id: string, rest: Partial<Camera>): Camera => ({ id, projectId: 'p', ...rest });
const lens = (id: string, rest: Partial<Lens>): Lens => ({ id, projectId: 'p', ...rest });

describe('normalise', () => {
	it('lowers the case, drops accents and squashes spaces', () => {
		expect(normalise('  Angénieux   OPTIMO ')).toBe('angenieux optimo');
	});
});

describe('matchesQuery', () => {
	it('needs every word of the query, in any field, in any order', () => {
		expect(matchesQuery(['Cooke', 'S4/i 32 mm'], 'cooke 32')).toBe(true);
		expect(matchesQuery(['Cooke', 'S4/i 32 mm'], '32 cooke')).toBe(true);
		expect(matchesQuery(['Cooke', 'S4/i 32 mm'], 'cooke 50')).toBe(false);
	});
	it('matches everything on an empty query', () => {
		expect(matchesQuery([undefined], '  ')).toBe(true);
	});
});

describe('searchCameras', () => {
	const cams = [cam('a', { cameraMake: 'ARRI', cameraModel: 'Alexa 35', cameraSerialNumber: 'K1.0012345' }), cam('b', { cameraMake: 'Sony', cameraModel: 'Venice 2' })];
	it('finds by make, model and serial number', () => {
		expect(searchCameras(cams, 'venice').map((c) => c.id)).toEqual(['b']);
		expect(searchCameras(cams, '12345').map((c) => c.id)).toEqual(['a']);
		expect(searchCameras(cams, '').map((c) => c.id)).toEqual(['a', 'b']);
	});
});

describe('searchLenses', () => {
	const lenses = [lens('p', { lensMake: 'Cooke', lensModel: 'S4/i', focalLength: 32 }), lens('z', { lensMake: 'Angénieux', lensModel: 'Optimo', focalLength: 24, focalLengthMax: 290 })];
	it('finds by focal length, with or without mm, and by a word of the kind', () => {
		expect(searchLenses(lenses, '32mm').map((l) => l.id)).toEqual(['p']);
		expect(searchLenses(lenses, '290').map((l) => l.id)).toEqual(['z']);
		expect(searchLenses(lenses, 'angenieux').map((l) => l.id)).toEqual(['z']);
	});
	it('finds by the kind word given', () => {
		expect(searchLenses(lenses, 'zoom', { prime: 'prime', zoom: 'zoom' }).map((l) => l.id)).toEqual(['z']);
	});
});

describe('searchSetups', () => {
	const cams = [cam('c1', { cameraModel: 'Alexa 35' })];
	const lenses = [lens('l1', { lensModel: 'Optimo' })];
	const setups: CameraSetup[] = [
		{ id: 's1', projectId: 'p', cameraLabel: 'A', cameraId: 'c1' },
		{ id: 's2', projectId: 'p', cameraLabel: 'Second Unit', lensId: 'l1' }
	];
	it('finds by label, body or lens', () => {
		expect(searchSetups(setups, cams, lenses, 'alexa').map((s) => s.id)).toEqual(['s1']);
		expect(searchSetups(setups, cams, lenses, 'optimo').map((s) => s.id)).toEqual(['s2']);
		expect(searchSetups(setups, cams, lenses, 'second').map((s) => s.id)).toEqual(['s2']);
	});
});

describe('sortCameras', () => {
	it('sorts by name, numbers in counting order, then by serial number', () => {
		const sorted = sortCameras([
			cam('3', { cameraMake: 'Sony', cameraModel: 'Venice 2' }),
			cam('2', { cameraMake: 'ARRI', cameraModel: 'Alexa 35', cameraSerialNumber: 'B' }),
			cam('1', { cameraMake: 'ARRI', cameraModel: 'Alexa 35', cameraSerialNumber: 'A' }),
			cam('0', { cameraMake: 'ARRI', cameraModel: 'Alexa 265' })
		]);
		expect(sorted.map((c) => c.id)).toEqual(['1', '2', '0', '3']);
	});
});

describe('sortLenses', () => {
	it('puts primes by focal length first, then zooms by their short end, then the rest', () => {
		const sorted = sortLenses([
			lens('none', { lensModel: 'Unknown' }),
			lens('z', { lensModel: 'Optimo', focalLength: 24, focalLengthMax: 290 }),
			lens('p50', { lensModel: 'S4/i', focalLength: 50 }),
			lens('p32b', { lensModel: 'S4/i', focalLength: 32, lensSerialNumber: '2' }),
			lens('p32a', { lensModel: 'S4/i', focalLength: 32, lensSerialNumber: '1' }),
			lens('z2', { lensModel: 'Fujinon', focalLength: 19, focalLengthMax: 90 })
		]);
		expect(sorted.map((l) => l.id)).toEqual(['p32a', 'p32b', 'p50', 'z2', 'z', 'none']);
	});
	it('does not change the list it is given', () => {
		const list = [lens('b', { focalLength: 50 }), lens('a', { focalLength: 32 })];
		sortLenses(list);
		expect(list.map((l) => l.id)).toEqual(['b', 'a']);
	});
});
