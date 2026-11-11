// What a camera or a lens is called in a list, and what kind of lens it is. Pure.

import { isPrime, isZoom } from '$lib/model/take';
import type { Camera, Lens } from '$lib/model/types';

export type GearScope = 'camera' | 'lens';
export type LensKind = 'prime' | 'zoom' | 'unknown';

/** Make and model, the make left out when the model already starts with it. */
function title(make: string | undefined, model: string | undefined): string {
	const mk = (make ?? '').trim();
	const md = (model ?? '').trim();
	if (!mk) return md;
	if (!md) return mk;
	return md.toLowerCase().startsWith(mk.toLowerCase()) ? md : `${mk} ${md}`;
}

export function cameraTitle(camera: Camera): string {
	return title(camera.cameraMake, camera.cameraModel);
}

export function lensTitle(lens: Lens): string {
	return title(lens.lensMake, lens.lensModel);
}

export function gearTitle(scope: GearScope, record: Camera | Lens): string {
	return scope === 'camera' ? cameraTitle(record as Camera) : lensTitle(record as Lens);
}

/** Prime: one focal length. Zoom: a range. Unknown: no focal length yet. */
export function lensKind(lens: Lens): LensKind {
	return isZoom(lens) ? 'zoom' : isPrime(lens) ? 'prime' : 'unknown';
}

/** The focal length of a prime, or both ends of a zoom, in mm. */
export function focalRange(lens: Lens): { min: number; max?: number } | undefined {
	if (lens.focalLength === undefined) return undefined;
	return isZoom(lens) ? { min: lens.focalLength, max: lens.focalLengthMax } : { min: lens.focalLength };
}
