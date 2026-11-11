// Focal length comes from the lens when it is a prime; only a zoom's is entered. Pure.
import type { Lens } from './types';

export const focalEditable = (lens: Lens): boolean => lens.kind === 'zoom';

/** The focal length in mm: the prime's own, or what was entered on a zoom, kept in its range. */
export function focalLengthOf(lens: Lens, entered: number | null): number | null {
	if (lens.kind === 'prime') return lens.focalLength;
	if (entered === null) return null;
	return Math.min(lens.max, Math.max(lens.min, entered));
}
