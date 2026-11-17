// A slate's setup diagram (#87): a top-down sketch of where the cameras, the subject, the lights
// and the markers stand, with distances. One per slate, kept on the device in the `diagram`
// table. When it opens, the slate's camera setups place themselves as camera symbols with their
// lens and field of view; the person drags and turns them. Pure.

import { sortTakes } from '$lib/app/takeRows';
import { t } from '$lib/i18n/messages';
import { sortSetups } from '$lib/gear/setups';
import { effectiveFocalLength, isPrime } from '$lib/model/take';
import type { Camera, CameraSetup, Lens, Take } from '$lib/model/types';
import { crc32 } from '$lib/store/crc32';
import { isBlank, styleFor, type Drawing, type Figure, type Shape, type Size } from './drawing';
import type { FileInfo } from './markup';
import { fieldOfView, squeezeOf } from './optics';

/** One slate's diagram. The sheet is 1600 by 1200 units, as the exported image. */
export type Diagram = Drawing & { id: string; slateId: string };

export const DIAGRAM_SIZE: Size = { width: 1600, height: 1200 };
/** How far a camera's field of view reaches on the sheet. The sketch is not to scale: the angle is what counts. */
export const DIAGRAM_REACH = 540;

/** A camera setup of the slate, as its symbol shows it. */
export type SlateCamera = {
	setupId: string;
	/** The camera letter. */
	label: string;
	/** The lens's model. */
	lens?: string;
	/** mm. */
	focal?: number;
	/** The horizontal field of view, in degrees. */
	fov?: number;
};

/**
 * The camera setups of a slate, by letter: those on its takes, or every setup of the project
 * while it has none. Each with the lens and body of its latest take (else the setup's), the focal
 * length of a prime, or of a zoom from the latest take that has one, and the field of view from
 * the body's sensor width and the lens's squeeze.
 */
export function slateCameras(input: { takes: readonly Take[]; setups: readonly CameraSetup[]; cameras: readonly Camera[]; lenses: readonly Lens[] }): SlateCamera[] {
	const shot = sortTakes(input.takes);
	const onSlate = new Set(shot.map((t) => t.cameraSetupId).filter((id): id is string => !!id));
	const setups = sortSetups(onSlate.size ? input.setups.filter((s) => onSlate.has(s.id)) : input.setups);
	return setups.map((setup) => {
		const takes = shot.filter((t) => t.cameraSetupId === setup.id).reverse();
		const latest = takes[0];
		const lens = input.lenses.find((l) => l.id === (latest?.lensId ?? setup.lensId));
		const camera = input.cameras.find((c) => c.id === (latest?.cameraId ?? setup.cameraId));
		const focal = lens && isPrime(lens) ? lens.focalLength : takes.map((t) => effectiveFocalLength(t, lens)?.start).find((f) => f !== undefined);
		const fov = fieldOfView(focal, camera?.activeSensorPhysicalDimensions?.width, squeezeOf(lens?.anamorphicSqueeze));
		return {
			setupId: setup.id,
			label: setup.cameraLabel ?? '',
			...(lens?.lensModel ? { lens: lens.lensModel } : {}),
			...(focal !== undefined ? { focal } : {}),
			...(fov !== undefined ? { fov } : {})
		};
	});
}

/** The id of the symbol a camera setup places for itself. */
const cameraId = (setupId: string) => `camera-${setupId}`;

/**
 * The shapes with a camera symbol for each setup not on the diagram yet: along the foot, spread
 * evenly in letter order, facing up. A setup the person placed stays where it is.
 */
export function placeCameras(shapes: readonly Shape[], cameras: readonly SlateCamera[], size: Size, symbolSize: number): Shape[] {
	const placed = new Set(shapes.flatMap((s) => (s.kind === 'symbol' && s.setupId ? [s.setupId] : [])));
	const added: Figure[] = cameras.flatMap((cam, i) =>
		placed.has(cam.setupId)
			? []
			: [
					{
						kind: 'symbol',
						id: cameraId(cam.setupId),
						symbol: 'camera',
						ink: 'black',
						at: { x: (size.width * (i + 1)) / (cameras.length + 1), y: size.height * 0.8 },
						rotation: 0,
						size: symbolSize,
						setupId: cam.setupId
					}
				]
	);
	return [...shapes, ...added];
}

const cameraOf = (cameras: readonly SlateCamera[], f: Figure) => (f.symbol === 'camera' && f.setupId ? cameras.find((c) => c.setupId === f.setupId) : undefined);

/** The words under a camera of the slate: its letter, its lens, its focal length and field of view. */
export function cameraCaptions(cameras: readonly SlateCamera[]): (f: Figure) => string[] {
	return (f) => {
		const cam = cameraOf(cameras, f);
		if (!cam) return [];
		const optics = [
			cam.focal !== undefined ? t('draw.diagram.focal', { focal: Number(cam.focal.toFixed(1)) }) : '',
			cam.fov !== undefined ? t('draw.diagram.fov', { fov: Math.round(cam.fov) }) : ''
		].filter(Boolean);
		return [cam.label, cam.lens ?? '', optics.join(' · ')].filter(Boolean);
	};
}

/** The field of view of a camera of the slate, for its wedge. */
export function cameraFov(cameras: readonly SlateCamera[]): (f: Figure) => number | undefined {
	return (f) => cameraOf(cameras, f)?.fov;
}

/**
 * A short fingerprint of what the diagram's image shows: its shapes, with the cameras placed, and
 * what each camera says. A lens swapped, or a zoom's focal length on a later take, changes it.
 */
export function diagramKey(diagram: Drawing, cameras: readonly SlateCamera[]): string {
	const shapes = placeCameras(diagram.shapes, cameras, diagram, styleFor(diagram).symbol);
	const text = JSON.stringify({ width: diagram.width, height: diagram.height, shapes, cameras });
	return crc32(new TextEncoder().encode(text)).toString(16).padStart(8, '0');
}

/**
 * What to do so the slate's diagram image on Flow PT matches the diagram: `make` an image of the
 * one with key `key`, and `drop` the images that no longer match and were not seen on Flow PT.
 * The store refuses to drop one whose upload has left. A blank diagram, or none, gets no image.
 */
export function diagramPlan(diagram: Drawing | undefined, key: string, files: readonly FileInfo[]): { make?: string; drop: string[] } {
	const images = files.filter((f) => f.variant === 'diagram').sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
	const wanted = diagram && !isBlank(diagram);
	const current = wanted ? images.find((f) => f.source === key) : undefined;
	const drop = images.filter((f) => f !== current && f.verifiedAt === undefined && f.prunedAt === undefined).map((f) => f.id);
	return wanted && !current ? { make: key, drop } : { drop };
}

/** The symbols that stand for a camera setup of the slate: they place themselves, so they are not deleted. */
export function setupCameraIds(shapes: readonly Shape[], cameras: readonly SlateCamera[]): Set<string> {
	const setups = new Set(cameras.map((c) => c.setupId));
	return new Set(shapes.flatMap((s) => (s.kind === 'symbol' && s.setupId && setups.has(s.setupId) ? [s.id] : [])));
}
