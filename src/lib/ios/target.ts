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

export function pxToMm(px: number, pxPerMm = IPAD_PX_PER_MM): number {
	return px / pxPerMm;
}

/**
 * A touch wider than this is a palm or the heel of the hand, not a fingertip. A fingertip is
 * 8 to 14 mm across, a flat thumb or a gloved finger up to about 20 mm, a palm 40 mm and more.
 */
export const PALM_MM = 30;

/**
 * Whether a pointer's contact is a palm: a touch wider than PALM_MM on either axis. A touch that
 * reports no size, a mouse and a pen always pass: a real press is never refused on a guess.
 */
export function isPalm(contact: { pointerType: string; width: number; height: number }, pxPerMm = IPAD_PX_PER_MM): boolean {
	if (contact.pointerType !== 'touch') return false;
	return Math.max(contact.width, contact.height) > mmToPx(PALM_MM, pxPerMm);
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
