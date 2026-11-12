import { describe, expect, it } from 'vitest';
import { rational } from '$lib/model/rational';
import type { Camera, Lens } from '$lib/model/types';
import { cameraRecord, inProject, lensRecord, lensSeries, libraryAdds, parseLibraryCameras, parseLibraryLenses, pickModel, searchLibraryCameras, searchModes, searchSeries } from './library';

const CAMERAS = `cameraMake,cameraModel,sensorMode,sensorWidthMm,sensorHeightMm,resolutionWidthPx,resolutionHeightPx,sourceUrl,confidence
ARRI,Alexa 35,4.6K 3:2 Open Gate,27.99,19.22,4608,3164,https://example.com/a35,maker
Sony,Venice 2 8K,,,,8640,5760,https://example.com/v2,maker
`;

const MODES = `cameraMake,cameraModel,sensorMode,sensorWidthMm,sensorHeightMm,resolutionWidthPx,resolutionHeightPx,sourceUrl,confidence
ARRI,Alexa 35,4K 16:9,24.88,14.00,4096,2304,https://example.com/a35m,maker
ARRI,Alexa 35,2K 16:9 S16,12.44,7.00,2048,1152,https://example.com/a35m,maker
RED,Nothing,8K,40,21,8192,4320,https://example.com/x,maker
`;

const LENSES = `lensMake,series,lensModel,focalLength,focalLengthMax,anamorphicSqueeze,maxTStop,coverage,sourceUrl,confidence
Cooke,S4/i,S4/i 50 mm,50,,,2,S35,https://example.com/s4,maker
Cooke,S4/i,S4/i 32 mm,32,,,2,S35,https://example.com/s4,maker
Angénieux,Optimo,Optimo 24-290,24,290,,2.8,S35,https://example.com/o,maker
Cooke,Anamorphic/i FF,Anamorphic/i FF 40 mm,40,,1.8,2.3,FF,https://example.com/ana,maker
`;

describe('parseLibraryCameras', () => {
	it('reads each body with its full-sensor mode, the sizes when both sides are given', () => {
		expect(parseLibraryCameras(CAMERAS)).toEqual([
			{ make: 'ARRI', model: 'Alexa 35', modes: [{ name: '4.6K 3:2 Open Gate', sensor: { width: 27.99, height: 19.22 }, resolution: { width: 4608, height: 3164 }, source: 'https://example.com/a35' }] },
			{ make: 'Sony', model: 'Venice 2 8K', modes: [{ resolution: { width: 8640, height: 5760 }, source: 'https://example.com/v2' }] }
		]);
	});
	it('adds the other modes of a body after its full sensor, and drops a mode of no known body', () => {
		const [a35, venice] = parseLibraryCameras(CAMERAS, MODES);
		expect(a35.modes.map((m) => m.name)).toEqual(['4.6K 3:2 Open Gate', '4K 16:9', '2K 16:9 S16']);
		expect(a35.modes[1]).toEqual({ name: '4K 16:9', sensor: { width: 24.88, height: 14 }, resolution: { width: 4096, height: 2304 }, source: 'https://example.com/a35m' });
		expect(venice.modes).toHaveLength(1);
	});
});

describe('pickModel', () => {
	it('is the body alone for the full sensor, the body and the mode for another', () => {
		const [camera] = parseLibraryCameras(CAMERAS, MODES);
		expect(pickModel({ camera, mode: camera.modes[0] })).toBe('Alexa 35');
		expect(pickModel({ camera, mode: camera.modes[1] })).toBe('Alexa 35, 4K 16:9');
	});
});

describe('parseLibraryLenses', () => {
	it('reads primes, zooms and the squeeze', () => {
		const lenses = parseLibraryLenses(LENSES);
		expect(lenses[0]).toEqual({ make: 'Cooke', series: 'S4/i', model: 'S4/i 50 mm', focalLength: 50, tStop: 2, coverage: 'S35', source: 'https://example.com/s4' });
		expect(lenses[2]).toMatchObject({ focalLength: 24, focalLengthMax: 290 });
		expect(lenses[3].squeeze).toEqual(rational(9, 5));
	});
});

describe('lensSeries', () => {
	it('groups by make and series, makes and series by name, lenses by focal length', () => {
		const series = lensSeries(parseLibraryLenses(LENSES));
		expect(series.map((s) => `${s.make} ${s.series}`)).toEqual(['Angénieux Optimo', 'Cooke Anamorphic/i FF', 'Cooke S4/i']);
		expect(series[2].lenses.map((l) => l.focalLength)).toEqual([32, 50]);
		expect(new Set(series.map((s) => s.key)).size).toBe(3);
	});
});

describe('search', () => {
	it('finds cameras by make and model, whatever the case', () => {
		const cameras = parseLibraryCameras(CAMERAS);
		expect(searchLibraryCameras(cameras, 'alexa').map((c) => c.model)).toEqual(['Alexa 35']);
		expect(searchLibraryCameras(cameras, 'sony 8k').map((c) => c.model)).toEqual(['Venice 2 8K']);
		expect(searchLibraryCameras(cameras, '')).toHaveLength(2);
		expect(searchLibraryCameras(parseLibraryCameras(CAMERAS, MODES), 's16')).toEqual([]);
	});
	it('finds the modes of a body by name', () => {
		const [a35] = parseLibraryCameras(CAMERAS, MODES);
		expect(searchModes(a35, '16:9').map((m) => m.name)).toEqual(['4K 16:9', '2K 16:9 S16']);
		expect(searchModes(a35, '4k 16').map((m) => m.name)).toEqual(['4K 16:9']);
		expect(searchModes(a35, '')).toHaveLength(3);
	});
	it('finds series by make, name, accents aside, and by a focal length in them', () => {
		const series = lensSeries(parseLibraryLenses(LENSES));
		expect(searchSeries(series, 'angenieux').map((s) => s.series)).toEqual(['Optimo']);
		expect(searchSeries(series, 'cooke').map((s) => s.series)).toEqual(['Anamorphic/i FF', 'S4/i']);
		expect(searchSeries(series, '32mm').map((s) => s.series)).toEqual(['S4/i']);
	});
});

describe('records', () => {
	it('makes a camera as the catalogue stores it', () => {
		const [a35, venice] = parseLibraryCameras(CAMERAS, MODES);
		expect(cameraRecord({ camera: a35, mode: a35.modes[1] }, 'c0', 'p')).toEqual({
			id: 'c0',
			projectId: 'p',
			cameraMake: 'ARRI',
			cameraModel: 'Alexa 35, 4K 16:9',
			activeSensorPhysicalDimensions: { width: 24.88, height: 14 },
			activeSensorResolution: { width: 4096, height: 2304 }
		});
		expect(cameraRecord({ camera: a35, mode: a35.modes[0] }, 'c1', 'p')).toEqual({
			id: 'c1',
			projectId: 'p',
			cameraMake: 'ARRI',
			cameraModel: 'Alexa 35',
			activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 },
			activeSensorResolution: { width: 4608, height: 3164 }
		});
		expect(cameraRecord({ camera: venice, mode: venice.modes[0] }, 'c2', 'p')).toEqual({ id: 'c2', projectId: 'p', cameraMake: 'Sony', cameraModel: 'Venice 2 8K', activeSensorResolution: { width: 8640, height: 5760 } });
	});
	it('makes a lens: a prime, a zoom, an anamorphic', () => {
		const lenses = parseLibraryLenses(LENSES);
		expect(lensRecord(lenses[0], 'l1', 'p')).toEqual({ id: 'l1', projectId: 'p', lensMake: 'Cooke', lensModel: 'S4/i 50 mm', focalLength: 50 });
		expect(lensRecord(lenses[2], 'l2', 'p')).toMatchObject({ focalLength: 24, focalLengthMax: 290 });
		expect(lensRecord(lenses[3], 'l3', 'p')).toMatchObject({ anamorphicSqueeze: rational(9, 5) });
	});
});

describe('libraryAdds', () => {
	const lenses = parseLibraryLenses(LENSES);
	const ids = () => {
		let n = 0;
		return () => `id${++n}`;
	};
	it('makes a record per pick and leaves out what the project already has with no serial number', () => {
		const existing: Lens[] = [{ id: 'x', projectId: 'p', lensMake: 'Cooke', lensModel: 's4/i 50 MM' }];
		const out = libraryAdds('lens', [lenses[0], lenses[1]], existing, 'p', ids());
		expect(out.records.map((r) => (r as Lens).lensModel)).toEqual(['S4/i 32 mm']);
		expect(out.already).toBe(1);
	});
	it('adds a second unit beside one with a serial number', () => {
		const existing: Lens[] = [{ id: 'x', projectId: 'p', lensModel: 'S4/i 50 mm', lensSerialNumber: '123' }];
		expect(libraryAdds('lens', [lenses[0]], existing, 'p', ids()).records).toHaveLength(1);
	});
	it('does not add the same pick twice', () => {
		expect(libraryAdds('lens', [lenses[0], lenses[0]], [], 'p', ids()).records).toHaveLength(1);
	});
	it('says what is in the project', () => {
		const cameras = parseLibraryCameras(CAMERAS, MODES);
		const existing: Camera[] = [{ id: 'c', projectId: 'p', cameraModel: 'Alexa 35' }];
		expect(inProject('camera', { camera: cameras[0], mode: cameras[0].modes[0] }, existing)).toBe(true);
		expect(inProject('camera', { camera: cameras[0], mode: cameras[0].modes[1] }, existing)).toBe(false);
		expect(inProject('camera', { camera: cameras[1], mode: cameras[1].modes[0] }, existing)).toBe(false);
	});
});
