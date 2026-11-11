// The sample project: a made-up shoot to look around with, built as real records of the model.
// Its name says Sample. Pure: ids and the clock are passed in; `loadSample` (records.svelte.ts)
// writes it through the store like anything typed by hand.

import { metres } from '$lib/model/length';
import { rational } from '$lib/model/rational';
import type { Camera, CameraSetup, Lens, LightingSetup, Project, ShootDay, Slate, Take } from '$lib/model/types';
import type { RowOf, TableName } from '$lib/store/tables';
import { addDays, today } from './format';

export const SAMPLE_NAME = 'Sample project';

export interface Sample {
	project: Project;
	shootDays: ShootDay[];
	cameras: Camera[];
	lenses: Lens[];
	lightingSetups: LightingSetup[];
	cameraSetups: CameraSetup[];
	slates: Slate[];
	takes: Take[];
}

export function sampleProject(options: { newId: () => string; now: Date }): Sample {
	const { newId, now } = options;
	const date = today(now);
	const project: Project = { id: newId(), name: SAMPLE_NAME };
	const projectId = project.id;

	const day1: ShootDay = { id: newId(), projectId, shootDate: addDays(date, -1), shootDay: 1, cameraUnit: 'Main', location: 'Stage 4', wrangler: 'Sample' };
	const day2: ShootDay = { id: newId(), projectId, shootDate: date, shootDay: 2, cameraUnit: 'Main', location: 'Harbour street', wrangler: 'Sample' };

	const alexa: Camera = {
		id: newId(),
		projectId,
		cameraMake: 'ARRI',
		cameraModel: 'Alexa 35',
		activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 },
		activeSensorResolution: { width: 4608, height: 3164 }
	};
	const mini: Camera = {
		id: newId(),
		projectId,
		cameraMake: 'ARRI',
		cameraModel: 'Alexa Mini LF',
		activeSensorPhysicalDimensions: { width: 36.7, height: 25.54 },
		activeSensorResolution: { width: 4448, height: 3096 }
	};
	const prime32: Lens = { id: newId(), projectId, lensMake: 'Cooke', lensModel: 'S4/i 32 mm T2', focalLength: 32 };
	const prime50: Lens = { id: newId(), projectId, lensMake: 'Cooke', lensModel: 'S4/i 50 mm T2', focalLength: 50 };
	const zoom: Lens = { id: newId(), projectId, lensMake: 'Angénieux', lensModel: 'Optimo 24-290 mm T2.8', focalLength: 24, focalLengthMax: 290 };

	const stage: LightingSetup = { id: newId(), projectId, label: 'Stage, blue screen', hdri: true, hdriFilename: 'stage4_bluescreen_001.exr', referenceBalls: true, colourChart: true };
	const street: LightingSetup = { id: newId(), projectId, label: 'Street, dusk', hdri: true, referenceBalls: true, notes: 'Sodium lamps camera left.' };

	const camA: CameraSetup = { id: newId(), projectId, cameraLabel: 'A', cameraId: alexa.id, lensId: prime32.id };
	const camB: CameraSetup = { id: newId(), projectId, cameraLabel: 'B', cameraId: mini.id, lensId: zoom.id };

	const slate = (day: ShootDay, slateUID: string, rest: Partial<Slate>): Slate => ({ id: newId(), shootDayId: day.id, slateUID, ...rest });
	const s12a = slate(day1, '12A', { sceneNumber: '12', description: 'She steps off the ledge. Wire work.', lightingSetupId: stage.id, interiorExterior: 'int', scriptTime: 'night', vfxShots: ['SMP_012_0010', 'SMP_012_0020'], cleanPlate: true });
	const s12b = slate(day1, '12B', { sceneNumber: '12', description: 'Close on the hands.', lightingSetupId: stage.id, interiorExterior: 'int', scriptTime: 'night' });
	const s42a = slate(day2, '42A', { sceneNumber: '42', description: 'The car slides to the kerb. Wide.', lightingSetupId: street.id, interiorExterior: 'ext', scriptTime: 'dusk', vfxShots: ['SMP_042_0010'], lidar: true, witnessCamera: true });
	const s42b = slate(day2, '42B', { sceneNumber: '42', description: 'Driver through the windscreen.', lightingSetupId: street.id, interiorExterior: 'ext', scriptTime: 'dusk' });

	// Takes are timed back from now, a few minutes apart, so the sample day reads as today's.
	let minutes = 95;
	const fps = rational(24, 1);
	const take = (s: Slate, setup: CameraSetup, n: string, rest: Partial<Take>): Take => {
		const start = now.getTime() - minutes * 60_000;
		minutes -= 4;
		return {
			id: newId(),
			slateId: s.id,
			take: n,
			startedAt: new Date(start).toISOString(),
			endedAt: new Date(start + 48_000).toISOString(),
			cameraSetupId: setup.id,
			cameraId: setup.cameraId,
			lensId: setup.lensId,
			captureFrameRate: fps,
			shutterAngle: 180,
			isoSpeed: 800,
			whiteBalance: 4300,
			...rest
		};
	};
	const a = { tStop: 2.8, focusDistance: metres(4.2), lensHeight: metres(1.45), tilt: -3 };
	const b = { tStop: 4, focusDistance: metres(12), lensHeight: metres(2.1), tilt: -8, focalLength: 135 };
	const takes: Take[] = [
		take(s12a, camA, '1', { ...a, noGood: true, notes: 'Wire in frame.' }),
		take(s12a, camA, '2', { ...a, circleTake: true }),
		take(s12b, camA, '1', { tStop: 2, focusDistance: metres(0.9), lensHeight: metres(1.2), tilt: -12, lensId: prime50.id, circleTake: true }),
		take(s42a, camA, '1', a),
		take(s42a, camB, '1', b),
		take(s42a, camA, '2', { ...a, circleTake: true }),
		take(s42a, camB, '2', { ...b, focalLength: 150, focalLengthEnd: 85, circleTake: true }),
		take(s42a, camA, '3', { ...a, tilt: -5 }),
		take(s42b, camA, '1', { tStop: 2, focusDistance: metres(1.8), lensHeight: metres(1.52), tilt: 0 })
	];

	return {
		project,
		shootDays: [day1, day2],
		cameras: [alexa, mini],
		lenses: [prime32, prime50, zoom],
		lightingSetups: [stage, street],
		cameraSetups: [camA, camB],
		slates: [s12a, s12b, s42a, s42b],
		takes
	};
}

/** The sample as rows to create, in an order where every record comes after the ones it links to. */
export function sampleRows(sample: Sample): { table: TableName; row: RowOf<TableName> }[] {
	const of = <T extends TableName>(table: T, rows: RowOf<T>[]) => rows.map((row) => ({ table, row }));
	return [
		...of('project', [sample.project]),
		...of('shootDay', sample.shootDays),
		...of('camera', sample.cameras),
		...of('lens', sample.lenses),
		...of('lightingSetup', sample.lightingSetups),
		...of('cameraSetup', sample.cameraSetups),
		...of('slate', sample.slates),
		...of('take', sample.takes)
	];
}
