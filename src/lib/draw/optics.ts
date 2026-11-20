// What a camera on the setup diagram sees (#87): the horizontal field of view from the focal
// length, the sensor width and the lens's anamorphic squeeze, and the wedge drawn for it in front
// of the camera symbol. Pure.

import type { Rational } from '$lib/model/rational';
import type { Figure, Point } from './drawing';
import { heading } from './geometry';

/** A lens's anamorphic squeeze as a factor. A spherical lens, or none given, is 1. */
export function squeezeOf(squeeze: Rational | undefined): number {
	if (!squeeze || !(squeeze.num > 0) || !(squeeze.denom > 0)) return 1;
	return squeeze.num / squeeze.denom;
}

/**
 * The horizontal angle of view in degrees: 2 atan(w s / 2f). An anamorphic lens squeezes the
 * width it sees onto the sensor, so the width counts `squeeze` times: a 2x lens on a sensor 28 mm
 * wide sees as a spherical one on 56 mm. Undefined without a focal length or a sensor width.
 */
export function fieldOfView(focalMm: number | undefined, sensorWidthMm: number | undefined, squeeze = 1): number | undefined {
	if (!focalMm || focalMm <= 0 || !sensorWidthMm || sensorWidthMm <= 0 || !(squeeze > 0)) return undefined;
	return (2 * Math.atan((sensorWidthMm * squeeze) / (2 * focalMm)) * 180) / Math.PI;
}

/**
 * The wedge of a camera's field of view: from the front of its lens, the way it faces, `fov`
 * degrees wide and `reach` drawing units long. The apex, then the far left and far right corners.
 */
export function fovWedge(camera: Figure, fov: number, reach: number): [Point, Point, Point] {
	const ahead = heading(camera.rotation);
	const apex = { x: camera.at.x + ahead.x * camera.size * 0.5, y: camera.at.y + ahead.y * camera.size * 0.5 };
	const edge = (turn: number): Point => {
		const h = heading(camera.rotation + turn);
		return { x: apex.x + h.x * reach, y: apex.y + h.y * reach };
	};
	return [apex, edge(-fov / 2), edge(fov / 2)];
}
