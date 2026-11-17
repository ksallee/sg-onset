import { describe, expect, it } from 'vitest';
import type { Camera, CameraSetup, Lens, Take } from '$lib/model/types';
import type { Figure, Shape } from './drawing';
import { cameraCaptions, cameraFov, DIAGRAM_SIZE, diagramKey, diagramPlan, placeCameras, setupCameraIds, slateCameras, type SlateCamera } from './diagram';
import { fieldOfView } from './optics';

const setups: CameraSetup[] = [
	{ id: 'sB', projectId: 'p', cameraLabel: 'B', cameraId: 'lf', lensId: 'zoom' },
	{ id: 'sA', projectId: 'p', cameraLabel: 'A', cameraId: 'a35', lensId: 'p32' },
	{ id: 'sC', projectId: 'p', cameraLabel: 'C', cameraId: 'a35', lensId: 'ana' }
];
const cameras: Camera[] = [
	{ id: 'a35', projectId: 'p', cameraModel: 'ALEXA 35', activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 } },
	{ id: 'lf', projectId: 'p', cameraModel: 'ALEXA Mini LF', activeSensorPhysicalDimensions: { width: 36.7, height: 25.54 } },
	{ id: 'nosize', projectId: 'p', cameraModel: 'C500' }
];
const lenses: Lens[] = [
	{ id: 'p32', projectId: 'p', lensModel: 'S4/i 32 mm', focalLength: 32 },
	{ id: 'p50', projectId: 'p', lensModel: 'S4/i 50 mm', focalLength: 50 },
	{ id: 'zoom', projectId: 'p', lensModel: 'Optimo 24-290', focalLength: 24, focalLengthMax: 290 },
	{ id: 'ana', projectId: 'p', lensModel: 'Master Anamorphic 50', focalLength: 50, anamorphicSqueeze: { num: 2, denom: 1 } }
];
const take = (id: string, setup: string, over: Partial<Take> = {}): Take => ({ id, slateId: 's1', cameraSetupId: setup, take: id.slice(-1), ...over });

describe('slateCameras', () => {
	it('lists the camera setups on the slate’s takes, by letter, each with its lens and what it sees', () => {
		const takes = [take('a1', 'sA', { startedAt: '2026-11-11T09:00:00Z', lensId: 'p32', cameraId: 'a35' }), take('b1', 'sB', { startedAt: '2026-11-11T09:00:00Z', lensId: 'zoom', cameraId: 'lf', focalLength: 85 })];
		const cams = slateCameras({ takes, setups, cameras, lenses });
		expect(cams.map((c) => c.label)).toEqual(['A', 'B']);
		expect(cams[0]).toEqual({ setupId: 'sA', label: 'A', lens: 'S4/i 32 mm', focal: 32, fov: fieldOfView(32, 27.99) });
		expect(cams[1]).toMatchObject({ setupId: 'sB', lens: 'Optimo 24-290', focal: 85 });
	});

	it('takes a zoom’s focal length from the slate’s latest take that has one', () => {
		const takes = [
			take('b1', 'sB', { startedAt: '2026-11-11T09:00:00Z', lensId: 'zoom', cameraId: 'lf', focalLength: 85 }),
			take('b2', 'sB', { startedAt: '2026-11-11T09:10:00Z', lensId: 'zoom', cameraId: 'lf', focalLength: 120 }),
			take('b3', 'sB', { lensId: 'zoom', cameraId: 'lf' })
		];
		expect(slateCameras({ takes, setups, cameras, lenses })[0]).toMatchObject({ focal: 120, fov: fieldOfView(120, 36.7) });
	});

	it('follows the latest take’s lens over the setup’s, so a lens swap shows', () => {
		const takes = [take('a1', 'sA', { startedAt: '2026-11-11T09:00:00Z', lensId: 'p32' }), take('a2', 'sA', { startedAt: '2026-11-11T09:10:00Z', lensId: 'p50', cameraId: 'a35' })];
		expect(slateCameras({ takes, setups, cameras, lenses })[0]).toMatchObject({ lens: 'S4/i 50 mm', focal: 50 });
	});

	it('widens the view by the anamorphic squeeze', () => {
		const takes = [take('c1', 'sC', { startedAt: '2026-11-11T09:00:00Z' })];
		expect(slateCameras({ takes, setups, cameras, lenses })[0].fov).toBeCloseTo(fieldOfView(50, 27.99 * 2)!, 6);
	});

	it('gives no field of view without a sensor size or a focal length', () => {
		const takes = [take('b1', 'sB', { lensId: 'zoom', cameraId: 'lf' }), take('a1', 'sA', { cameraId: 'nosize' })];
		const cams = slateCameras({ takes, setups, cameras, lenses });
		expect(cams[0]).toMatchObject({ label: 'A', focal: 32 });
		expect(cams[0].fov).toBeUndefined();
		expect(cams[1].focal).toBeUndefined();
		expect(cams[1].fov).toBeUndefined();
	});

	it('takes every setup of the project when the slate has no take yet', () => {
		expect(slateCameras({ takes: [], setups, cameras, lenses }).map((c) => c.label)).toEqual(['A', 'B', 'C']);
	});
});

describe('placeCameras', () => {
	const cams: SlateCamera[] = [
		{ setupId: 'sA', label: 'A' },
		{ setupId: 'sB', label: 'B' }
	];
	it('places a camera symbol for each setup not on the diagram yet, along the foot, facing up', () => {
		const shapes = placeCameras([], cams, DIAGRAM_SIZE, 48);
		expect(shapes).toEqual([
			{ kind: 'symbol', id: 'camera-sA', symbol: 'camera', ink: 'black', at: { x: 1600 / 3, y: 960 }, rotation: 0, size: 48, setupId: 'sA' },
			{ kind: 'symbol', id: 'camera-sB', symbol: 'camera', ink: 'black', at: { x: 3200 / 3, y: 960 }, rotation: 0, size: 48, setupId: 'sB' }
		]);
	});
	it('leaves a setup the person already placed where it is', () => {
		const moved: Figure = { kind: 'symbol', id: 'camera-sA', symbol: 'camera', ink: 'black', at: { x: 200, y: 300 }, rotation: 45, size: 48, setupId: 'sA' };
		const shapes = placeCameras([moved], cams, DIAGRAM_SIZE, 48);
		expect(shapes).toHaveLength(2);
		expect(shapes[0]).toBe(moved);
		expect(shapes[1]).toMatchObject({ setupId: 'sB' });
	});
});

describe('cameraCaptions', () => {
	const cams: SlateCamera[] = [
		{ setupId: 'sA', label: 'A', lens: 'S4/i 32 mm', focal: 32, fov: 47.24 },
		{ setupId: 'sB', label: 'B', lens: 'Optimo 24-290', focal: 24.55 },
		{ setupId: 'sC', label: 'C' }
	];
	const placed = placeCameras([], cams, DIAGRAM_SIZE, 48);
	const of = (setupId: string) => placed.find((s) => s.kind === 'symbol' && s.setupId === setupId) as Figure;
	it('writes the letter, the lens, the focal length and the field of view under a camera of the slate', () => {
		const captions = cameraCaptions(cams);
		expect(captions(of('sA'))).toEqual(['A', 'S4/i 32 mm', '32 mm · 47°']);
		expect(captions(of('sB'))).toEqual(['B', 'Optimo 24-290', '24.6 mm']);
		expect(captions(of('sC'))).toEqual(['C']);
	});
	it('writes nothing under a symbol that is not a camera of the slate', () => {
		const loose: Figure = { kind: 'symbol', id: 'x', symbol: 'camera', ink: 'black', at: { x: 0, y: 0 }, rotation: 0, size: 48 };
		expect(cameraCaptions(cams)(loose)).toEqual([]);
		expect(cameraCaptions(cams)({ ...loose, symbol: 'light', setupId: 'sA' })).toEqual([]);
	});
	it('gives the field of view of a camera of the slate', () => {
		expect(cameraFov(cams)(of('sA'))).toBe(47.24);
		expect(cameraFov(cams)(of('sB'))).toBeUndefined();
	});
});

describe('diagramKey', () => {
	const diagram = { id: 'dg', slateId: 's1', ...DIAGRAM_SIZE, shapes: [] as Shape[] };
	const cams: SlateCamera[] = [{ setupId: 'sA', label: 'A', lens: 'S4/i 32 mm', focal: 32, fov: 47.2 }];
	it('is the same for the same drawing and the same cameras', () => {
		const same = { ...diagram, id: 'other' };
		expect(diagramKey(diagram, cams)).toBe(diagramKey(same, cams));
		expect(diagramKey(diagram, cams)).toMatch(/^[0-9a-f]{8}$/);
	});
	it('changes with a shape, and with a camera’s lens or focal length', () => {
		const light: Figure = { kind: 'symbol', id: 'l', symbol: 'light', ink: 'black', at: { x: 1, y: 1 }, rotation: 0, size: 48 };
		expect(diagramKey({ ...diagram, shapes: [light] }, cams)).not.toBe(diagramKey(diagram, cams));
		expect(diagramKey(diagram, [{ ...cams[0], focal: 50, fov: 31 }])).not.toBe(diagramKey(diagram, cams));
	});
});

describe('diagramPlan', () => {
	const light: Figure = { kind: 'symbol', id: 'l', symbol: 'light', ink: 'black', at: { x: 1, y: 1 }, rotation: 0, size: 48 };
	const diagram = { id: 'dg', slateId: 's1', ...DIAGRAM_SIZE, shapes: [light] as Shape[] };
	const file = (id: string, createdAt: number, over: Record<string, unknown> = {}) => ({ id, recordId: 's1', createdAt, variant: 'diagram' as const, ...over });
	it('asks for an image when there is none made from the diagram as it is, and drops the stale unsent ones', () => {
		expect(diagramPlan(diagram, 'k2', [file('d1', 1, { source: 'k1' }), file('d0', 0, { source: 'k0', verifiedAt: 5 })])).toEqual({ make: 'k2', drop: ['d1'] });
	});
	it('does nothing when the image is there', () => {
		expect(diagramPlan(diagram, 'k2', [file('d2', 2, { source: 'k2' })])).toEqual({ drop: [] });
	});
	it('makes no image of a blank diagram, nor of none, and drops what is unsent', () => {
		expect(diagramPlan({ ...diagram, shapes: [] }, 'k2', [file('d1', 1, { source: 'k1' })])).toEqual({ drop: ['d1'] });
		expect(diagramPlan(undefined, 'k2', [file('d1', 1, { source: 'k1' })])).toEqual({ drop: ['d1'] });
	});
	it('looks at the diagram images of the slate only', () => {
		expect(diagramPlan(diagram, 'k2', [{ id: 'p', recordId: 's1', createdAt: 1 }])).toEqual({ make: 'k2', drop: [] });
	});
});

describe('setupCameraIds', () => {
	it('names the symbols that stand for a camera setup of the slate', () => {
		const shapes: Shape[] = placeCameras([], [{ setupId: 'sA', label: 'A' }], DIAGRAM_SIZE, 48);
		expect(setupCameraIds(shapes, [{ setupId: 'sA', label: 'A' }])).toEqual(new Set(['camera-sA']));
		expect(setupCameraIds(shapes, [])).toEqual(new Set());
	});
});
