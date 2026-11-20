import { describe, expect, it } from 'vitest';
import { ALE_COLUMNS } from '$lib/export/ale';
import { FIELDS, type FieldDef } from '$lib/model/catalogue';
import { autoMap, COLUMN_NAMES, knownTarget, setColumn, squash } from './columns';
import { ARRI_COLUMNS, AVID_COLUMNS, SILVERSTACK_COLUMNS } from './testFiles';

const at = (headers: readonly string[]) => (name: string) => headers.indexOf(name);

describe('autoMap', () => {
	it('reads a Silverstack file by its column names', () => {
		const i = at(SILVERSTACK_COLUMNS);
		expect(autoMap(SILVERSTACK_COLUMNS)).toEqual({
			clipName: i('Name'),
			cameraRoll: i('CamRoll'),
			camera: i('Camera'),
			timecodeStart: i('Start'),
			timecodeEnd: i('End'),
			duration: i('Duration'),
			fps: i('FPS'),
			lens: i('Lens'),
			tStop: i('F-Stop'),
			isoSpeed: i('ASA'),
			whiteBalance: i('Whitepoint'),
			shutterAngle: i('Shutter'),
			captureFrameRate: i('Sensor Fps')
		});
	});

	it('reads an ARRI file: Reel_name is the roll, Camera_index the letter, Lens_type the lens, FPS before Project_fps', () => {
		const i = at(ARRI_COLUMNS);
		expect(autoMap(ARRI_COLUMNS)).toEqual({
			clipName: i('Name'),
			cameraRoll: i('Reel_name'),
			camera: i('Camera_index'),
			timecodeStart: i('Start'),
			timecodeEnd: i('End'),
			duration: i('Duration'),
			fps: i('FPS'),
			lens: i('Lens_type'),
			isoSpeed: i('Exposure_index'),
			whiteBalance: i('White_balance'),
			shutterAngle: i('Shutter_angle'),
			captureFrameRate: i('Sensor_fps')
		});
	});

	it('reads an Avid file: Camroll before Reel', () => {
		const i = at(AVID_COLUMNS);
		expect(autoMap(AVID_COLUMNS)).toMatchObject({ clipName: i('Name'), cameraRoll: i('Camroll'), camera: i('Camera'), timecodeStart: i('Start'), timecodeEnd: i('End') });
	});

	it('reads the ALE SG OnSet writes', () => {
		const i = at(ALE_COLUMNS);
		expect(autoMap(ALE_COLUMNS)).toEqual({
			clipName: i('Name'),
			cameraRoll: i('Camroll'),
			camera: i('Camera'),
			timecodeStart: i('Start'),
			timecodeEnd: i('End'),
			duration: i('Duration'),
			fps: i('FPS'),
			lens: i('Lens'),
			focalLength: i('Focal Length'),
			tStop: i('T-Stop'),
			isoSpeed: i('ASA'),
			whiteBalance: i('Whitepoint'),
			shutterAngle: i('Shutter_angle'),
			captureFrameRate: i('Sensor Fps')
		});
	});

	it('knows the usual CSV names in any case and punctuation', () => {
		expect(autoMap(['Slate', 'Take', 'Clip Name', 'Roll', 'Cam', 'TC In', 'TC Out'])).toEqual({ clipName: 2, cameraRoll: 3, camera: 4, timecodeStart: 5, timecodeEnd: 6 });
		expect(autoMap(['CLIP_NAME', 'camera_roll', 'Camera Letter', 'start tc', 'end-tc'])).toEqual({ clipName: 0, cameraRoll: 1, camera: 2, timecodeStart: 3, timecodeEnd: 4 });
		expect(autoMap(['Clip', 'Lens Model', 'Focal Length (mm)', 'T-Stop', 'ISO', 'WB', 'Shutter Angle', 'Capture FPS'])).toEqual({
			clipName: 0,
			lens: 1,
			focalLength: 2,
			tStop: 3,
			isoSpeed: 4,
			whiteBalance: 5,
			shutterAngle: 6,
			captureFrameRate: 7
		});
	});

	it('maps nothing it does not know', () => {
		expect(autoMap(['Shot', 'Plate', 'Comment'])).toEqual({});
		expect(autoMap([])).toEqual({});
	});
});

describe('COLUMN_NAMES', () => {
	it('holds every ALE name the catalogue gives the fields it reads', () => {
		const fields = [
			['take', 'clipName', 'clipName'],
			['take', 'cameraRoll', 'cameraRoll'],
			['take', 'timecodeStart', 'timecodeStart'],
			['take', 'timecodeEnd', 'timecodeEnd'],
			['cameraSetup', 'cameraLabel', 'camera'],
			['take', 'tStop', 'tStop'],
			['take', 'captureFrameRate', 'captureFrameRate'],
			['take', 'shutterAngle', 'shutterAngle'],
			['take', 'isoSpeed', 'isoSpeed'],
			['take', 'whiteBalance', 'whiteBalance'],
			['lens', 'lensModel', 'lens']
		] as const;
		for (const [scope, key, target] of fields) {
			const def = (FIELDS as readonly FieldDef[]).find((d) => d.scope === scope && d.key === key)!;
			for (const name of Object.values(def.names?.ale ?? {})) expect(COLUMN_NAMES[target]).toContain(squash(name));
		}
	});
	it('gives no name to two targets', () => {
		const all = Object.values(COLUMN_NAMES).flat();
		expect(all.length).toBe(new Set(all).size);
	});
});

describe('knownTarget', () => {
	it('names what a header is read as', () => {
		expect(knownTarget('Reel_name')).toBe('cameraRoll');
		expect(knownTarget(' Clip name ')).toBe('clipName');
		expect(knownTarget('Sensor Fps')).toBe('captureFrameRate');
		expect(knownTarget('Lens_sn')).toBeUndefined();
		expect(knownTarget('Comment')).toBeUndefined();
	});
});

describe('setColumn', () => {
	it('reads a column as one thing only', () => {
		expect(setColumn({ clipName: 0, cameraRoll: 1 }, 'camera', 1)).toEqual({ clipName: 0, camera: 1 });
	});
	it('clears a target', () => {
		expect(setColumn({ clipName: 0, cameraRoll: 1 }, 'cameraRoll', undefined)).toEqual({ clipName: 0 });
	});
});
