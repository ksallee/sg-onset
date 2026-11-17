import { describe, expect, it } from 'vitest';
import { autoMap } from './columns';
import { cameraOf, clipNameOf, readClips } from './clips';
import { readSheet } from './sheet';
import { arriAle, avidAle, silverstackAle } from './testFiles';

const read = (text: string) => {
	const sheet = readSheet(text)!;
	return readClips(sheet, autoMap(sheet.headers));
};

describe('readClips', () => {
	it('reads a Silverstack clip: name, roll, camera, timecode in and the last frame', () => {
		const { clips, issues } = read(silverstackAle([{ name: 'A001C003_261117_S8XY', roll: 'A001', camera: 'A', start: '14:02:11:04', end: '14:02:59:10', duration: '00:00:48:06' }]));
		expect(issues).toEqual([]);
		expect(clips).toEqual([
			{
				row: 10,
				name: 'A001C003_261117_S8XY',
				roll: 'A001',
				camera: 'A',
				start: '14:02:11:04',
				end: '14:02:59:09',
				startFrame: (14 * 3600 + 2 * 60 + 11) * 24 + 4,
				endFrame: (14 * 3600 + 2 * 60 + 59) * 24 + 9,
				rate: { num: 24, denom: 1 },
				dropFrame: false,
				lens: 'Cooke S4/i 32mm',
				isoSpeed: 800,
				whiteBalance: 4300,
				shutterAngle: 172.8,
				captureFrameRate: { num: 24, denom: 1 }
			}
		]);
	});

	it('reads the camera’s values: a shutter speed at the frame rate, a stop of 0 as none', () => {
		const { clips, issues } = read(silverstackAle([{ name: 'A001C001', start: '10:00:00:00', shutter: '1/50s', sensorFps: '25', stop: 'T2.8', iso: '1280', wb: '5600K', lens: 'Optimo 24-290' }]));
		expect(issues).toEqual([]);
		expect(clips[0]).toMatchObject({ lens: 'Optimo 24-290', tStop: 2.8, isoSpeed: 1280, whiteBalance: 5600, shutterAngle: 180, captureFrameRate: { num: 25, denom: 1 } });
		const zero = read(silverstackAle([{ name: 'A001C001', stop: '0', lens: '' }])).clips[0];
		expect(zero).not.toHaveProperty('tStop');
		expect(zero).not.toHaveProperty('lens');
	});

	it('reads a focal length, and a shutter speed at the timecode rate with no frame rate', () => {
		const { clips } = read('Clip Name,TC In,FPS,Focal Length,Shutter\nA001C001,10:00:00:00,24,32mm,1/48');
		expect(clips[0]).toMatchObject({ focalLength: 32, shutterAngle: 180 });
	});

	it('reports a camera value it cannot read and leaves it out', () => {
		const { clips, issues } = read(silverstackAle([{ name: 'A001C001', iso: 'auto' }]));
		expect(clips[0]).not.toHaveProperty('isoSpeed');
		expect(issues).toEqual([{ kind: 'badValue', row: 10, column: 'ASA', value: 'auto' }]);
	});

	it('reads an ARRI clip at 25 fps, the letter from Camera_index', () => {
		const { clips } = read(arriAle([{ name: 'B002C007_261117_K1PZ', roll: 'B002', camera: 'B', start: '03:44:36:21', end: '03:45:06:02', duration: '00:00:29:06' }]));
		expect(clips[0]).toMatchObject({ name: 'B002C007_261117_K1PZ', roll: 'B002', camera: 'B', start: '03:44:36:21', end: '03:45:06:01', rate: { num: 25, denom: 1 } });
	});

	it('drops the file extension Avid keeps on the name', () => {
		const { clips } = read(avidAle([{ name: 'A001C001_261117_S8XY', roll: 'A001', start: '10:00:00:00', end: '10:00:10:00' }]));
		expect(clips[0].name).toBe('A001C001_261117_S8XY');
		expect(clips[0].end).toBe('10:00:09:23');
	});

	it('reads the rate on the row before the one in the heading', () => {
		const { clips } = read(silverstackAle([{ name: 'A001C001', start: '10:00:00:00', end: '10:00:01:00', fps: '25' }], '24'));
		expect(clips[0].rate).toEqual({ num: 25, denom: 1 });
		expect(clips[0].end).toBe('10:00:00:24');
	});

	it('reads drop frame at 29.97', () => {
		const { clips } = read(silverstackAle([{ name: 'A001C001', start: '10:00:59;29', end: '10:01:00;03' }], '29.97'));
		expect(clips[0]).toMatchObject({ start: '10:00:59;29', end: '10:01:00;02', dropFrame: true, rate: { num: 30000, denom: 1001 } });
	});

	it('takes the last frame from the duration when there is no End', () => {
		const { clips } = read('Clip Name,TC In,Duration,FPS\nA001C001,10:00:00:00,00:00:02:00,25');
		expect(clips[0].end).toBe('10:00:01:24');
	});

	it('guesses the rate of a file that names none, and says so', () => {
		const { clips, issues } = read('Clip Name,TC In,TC Out\nA001C001,10:00:00:00,10:00:00:24');
		expect(clips[0].rate).toEqual({ num: 25, denom: 1 });
		expect(issues).toEqual([{ kind: 'noRate', rate: { num: 25, denom: 1 } }]);
	});

	it('takes the camera letter from the roll, else the clip name, when no column gives it', () => {
		const { clips } = read('Clip Name,Roll\nA001C001_261117_S8XY,B003\nC004C001_261117_S8XY,\nclip_9,');
		expect(clips.map((c) => c.camera)).toEqual(['B', 'C', undefined]);
	});

	it('keeps a clip with no timecode, and reports timecode it cannot read', () => {
		const { clips, issues } = read('Clip Name,Roll,TC In,TC Out\nA001C001,A001,,\nA001C002,A001,soon,10:00:00:00');
		expect(clips.map((c) => [c.name, c.start, c.end])).toEqual([
			['A001C001', undefined, undefined],
			['A001C002', undefined, '09:59:59:23']
		]);
		expect(issues).toContainEqual({ kind: 'badTimecode', row: 3, column: 'TC In', value: 'soon' });
	});

	it('leaves out a row with no clip name, and says so', () => {
		const { clips, issues } = read('Clip Name,Roll\n,A001\nA001C002,A001');
		expect(clips.map((c) => c.name)).toEqual(['A001C002']);
		expect(issues).toEqual([{ kind: 'noName', row: 2 }]);
	});

	it('reads nothing without a clip name column', () => {
		const sheet = readSheet('Roll,TC In\nA001,10:00:00:00')!;
		expect(readClips(sheet, autoMap(sheet.headers))).toEqual({ clips: [], issues: [{ kind: 'noNameColumn' }] });
	});

	it('reads the columns the person picked', () => {
		const sheet = readSheet('Fichier,Bobine,Début\nA001C001,A001,10:00:00:00')!;
		expect(readClips(sheet, { clipName: 0, cameraRoll: 1, timecodeStart: 2 }).clips[0]).toMatchObject({ name: 'A001C001', roll: 'A001', start: '10:00:00:00' });
	});
});

describe('clipNameOf', () => {
	it('drops a camera file extension only', () => {
		expect(clipNameOf(' A001C001_261117_S8XY.mxf ')).toBe('A001C001_261117_S8XY');
		expect(clipNameOf('A001C001.R3D')).toBe('A001C001');
		expect(clipNameOf('A001C001.braw')).toBe('A001C001');
		expect(clipNameOf('Plate.v2')).toBe('Plate.v2');
	});
});

describe('cameraOf', () => {
	it('is the letters before the first digit', () => {
		expect(cameraOf('A001')).toBe('A');
		expect(cameraOf('b002')).toBe('B');
		expect(cameraOf('AA012')).toBe('AA');
		expect(cameraOf('001')).toBeUndefined();
		expect(cameraOf('Roll one')).toBeUndefined();
		expect(cameraOf(undefined)).toBeUndefined();
	});
});
