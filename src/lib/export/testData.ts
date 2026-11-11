// A small shoot, as the store returns it, for the export tests. Two shoot days, three slates, two
// camera setups (A on a prime, B on a zoom), photos on two takes. Test data only.

import type { Camera, CameraSetup, Lens, LightingSetup, Project, ShootDay, Slate, Still, Take } from '$lib/model/types';
import type { ExportInput } from './selection';

export const project: Project = { id: 'p1', name: 'Night Train' };

export const day3: ShootDay = { id: 'd3', projectId: 'p1', shootDate: '2026-11-10', shootDay: 3, cameraUnit: 'Main', location: 'Stage 4', wrangler: 'Ana Ruiz' };
export const day4: ShootDay = { id: 'd4', projectId: 'p1', shootDate: '2026-11-11', shootDay: 4, cameraUnit: 'Main', location: 'Platform 2' };

export const dusk: LightingSetup = { id: 'ls1', projectId: 'p1', label: 'Dusk wash', hdri: true, hdriFilename: 'LS1_dusk.exr', referenceBalls: true, colourChart: true };

export const alexa: Camera = { id: 'c1', projectId: 'p1', cameraMake: 'ARRI', cameraModel: 'ALEXA 35', cameraSerialNumber: '35-1234', activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 }, activeSensorResolution: { width: 4608, height: 3164 } };
export const venice: Camera = { id: 'c2', projectId: 'p1', cameraMake: 'Sony', cameraModel: 'VENICE 2' };

export const prime32: Lens = { id: 'l1', projectId: 'p1', lensMake: 'Cooke', lensModel: 'S4/i 32mm', lensSerialNumber: 'CK32-001', focalLength: 32 };
export const zoom: Lens = { id: 'l2', projectId: 'p1', lensMake: 'Angenieux', lensModel: 'Optimo 24-290', lensSerialNumber: 'ANG-7', focalLength: 24, focalLengthMax: 290, anamorphicSqueeze: { num: 1, denom: 1 } };

export const camA: CameraSetup = { id: 'csA', projectId: 'p1', cameraLabel: 'A', cameraId: 'c1', lensId: 'l1' };
export const camB: CameraSetup = { id: 'csB', projectId: 'p1', cameraLabel: 'B', cameraId: 'c2', lensId: 'l2' };

export const s42A: Slate = {
	id: '6f1c0d2e-0000-4000-8000-000000000042',
	shootDayId: 'd3',
	slateUID: '42A',
	sceneNumber: '42',
	setup: 'A',
	lightingSetupId: 'ls1',
	description: 'Wide on the platform',
	vfxShots: ['NT_042_010', 'NT_042_020'],
	elementType: 'Plate',
	interiorExterior: 'ext',
	scriptTime: 'magicHour',
	witnessCamera: true,
	notes: 'Rain, "light"'
};
export const s9: Slate = { id: 's9', shootDayId: 'd3', slateUID: '9', sceneNumber: '7' };
export const s10: Slate = { id: 's10', shootDayId: 'd3', slateUID: '10', sceneNumber: '7' };
export const s50: Slate = { id: 's50', shootDayId: 'd4', slateUID: '50', sceneNumber: '51' };

const fps24 = { num: 24, denom: 1 };

/** 42A take 1 on A: a prime, every value filled, focus pulled and the camera tilted. */
export const t42A1A: Take = {
	id: '7a000000-0000-4000-8000-000000000001',
	slateId: s42A.id,
	take: '1',
	startedAt: '2026-11-10T22:15:30.000Z',
	endedAt: '2026-11-10T22:16:10.000Z',
	circleTake: true,
	notes: 'Best\nperformance',
	cameraSetupId: 'csA',
	cameraId: 'c1',
	lensId: 'l1',
	focalLength: 50,
	tStop: 2.8,
	focusDistance: { m: 3.048, entered: { text: "10'", system: 'imperial' } },
	focusDistanceEnd: { m: 1.9177 },
	lensHeight: { m: 1.2, entered: { text: '1.2 m', system: 'metric' } },
	tilt: 10,
	tiltEnd: -5,
	roll: 2,
	captureFrameRate: { num: 24000, denom: 1001 },
	shutterAngle: 180,
	isoSpeed: 800,
	whiteBalance: 5600,
	filter: 'ND.6 Pola',
	cameraRoll: 'A001',
	clipName: 'A001C003',
	timecodeStart: '14:39:39:09',
	timecodeEnd: '14:39:59:10'
};
/** 42A take 1 on B: a zoom that moved, no timecode, no end time. */
export const t42A1B: Take = { id: 't42A1B', slateId: s42A.id, take: '1', startedAt: '2026-11-10T22:15:31.000Z', cameraSetupId: 'csB', cameraId: 'c2', lensId: 'l2', focalLength: 85, focalLengthEnd: 150, captureFrameRate: fps24, cameraRoll: 'B001' };
/** 42A take 2 on A: no good. */
export const t42A2A: Take = { id: 't42A2A', slateId: s42A.id, take: '2', startedAt: '2026-11-10T22:20:00.000Z', endedAt: '2026-11-10T22:21:00.000Z', noGood: true, cameraSetupId: 'csA', cameraId: 'c1', lensId: 'l1', captureFrameRate: fps24 };
/** 42A take 10 on A: sorts after take 2. */
export const t42A10A: Take = { id: 't42A10A', slateId: s42A.id, take: '10', startedAt: '2026-11-10T22:40:00.000Z', endedAt: '2026-11-10T22:41:00.000Z', cameraSetupId: 'csA', cameraId: 'c1', lensId: 'l1', captureFrameRate: fps24 };
/** 42A take 2 on B: a zoom with no focal length typed. */
export const t42A2B: Take = { id: 't42A2B', slateId: s42A.id, take: '2', startedAt: '2026-11-10T22:20:01.000Z', endedAt: '2026-11-10T22:21:00.000Z', cameraSetupId: 'csB', cameraId: 'c2', lensId: 'l2' };
/** 9 take 1: no camera setup, no lens. */
export const t9: Take = { id: 't9', slateId: 's9', take: '1', circleTake: true };
/** 10 take 1 on A. */
export const t10: Take = { id: 't10', slateId: 's10', take: '1', startedAt: '2026-11-10T23:00:00.000Z', endedAt: '2026-11-10T23:01:00.000Z', cameraSetupId: 'csA', cameraId: 'c1', lensId: 'l1' };
/** Day 4. */
export const t50: Take = { id: 't50', slateId: 's50', take: '1', cameraSetupId: 'csA', cameraId: 'c1', lensId: 'l1', circleTake: true };

export const still1: Still = { id: 'st1', takeId: t42A1A.id, capturedAt: '2026-11-10T22:17:00.000Z' };
export const still2: Still = { id: 'st2', takeId: t42A1A.id, capturedAt: '2026-11-10T22:16:30.000Z', caption: 'Ball pass' };
export const still3: Still = { id: 'st3', takeId: 't42A2A', capturedAt: '2026-11-10T22:22:00.000Z' };

export function input(): ExportInput {
	return {
		project,
		shootDays: [day4, day3],
		lightingSetups: [dusk],
		cameraSetups: [camB, camA],
		cameras: [venice, alexa],
		lenses: [zoom, prime32],
		slates: [s50, s10, s42A, s9],
		takes: [t50, t10, t9, t42A2B, t42A10A, t42A2A, t42A1B, t42A1A],
		stills: [still3, still1, still2]
	};
}
