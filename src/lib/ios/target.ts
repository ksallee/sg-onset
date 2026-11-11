// Touch targets in millimetres, as CSS pixels on an iPad. Pure.
//
// CSS's own `mm` is 96 px to the inch and is not a real millimetre on a tablet. Every full-size
// iPad is 264 ppi at 2x: 132 CSS px to the inch. An iPad mini is 326 ppi at 2x: 163.

export const IPAD_PX_PER_MM = 132 / 25.4;
export const IPAD_MINI_PX_PER_MM = 163 / 25.4;

/** Capture targets (Record, Photo): 15 mm bare handed, 20 mm with gloves, 3 mm apart. */
export const CAPTURE_MM = 15;
export const GLOVE_MM = 20;
export const GAP_MM = 3;

export function mmToPx(mm: number, pxPerMm = IPAD_PX_PER_MM): number {
	return Math.round(mm * pxPerMm);
}

export interface Target {
	mm: number;
	/** The side of the square target, px. */
	size: number;
	/** The space to the next target, px. */
	gap: number;
}

export function captureTarget(gloves: boolean, pxPerMm = IPAD_PX_PER_MM): Target {
	const mm = gloves ? GLOVE_MM : CAPTURE_MM;
	return { mm, size: mmToPx(mm, pxPerMm), gap: mmToPx(GAP_MM, pxPerMm) };
}
