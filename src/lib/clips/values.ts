// The camera's values in the DIT's file, read as take fields: T-stop, ISO, white balance, shutter
// angle, frame rate and focal length. A letter or unit around the number is dropped ("T2.8",
// "5600K", "32mm", "172.8°"); a shutter speed ("1/50s") becomes an angle at the frame rate. An
// empty cell, a dash or a zero is no value: cameras write 0 where they know nothing. A value the
// catalogue refuses is null, to report. Pure.

import { findField } from '$lib/model/catalogue';
import type { Rational } from '$lib/model/rational';
import type { FieldValue } from '$lib/model/types';
import { validateValue } from '$lib/model/validate';
import { readRate } from './timecode';

/** The take fields read this way. */
export type CameraValueKey = 'tStop' | 'isoSpeed' | 'whiteBalance' | 'shutterAngle' | 'captureFrameRate' | 'focalLength';

const NONE = /^(|-|—|–|n\/a|na|none)$/i;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
/** A shutter speed: 1/50, 1/50s, 1/50 sec. */
const SPEED = /^1\s*\/\s*(\d+(?:\.\d+)?)\s*(?:s|sec)?$/i;

/** The number in a cell, without its letter or unit. Undefined: no value. Null: not a number. */
function number(text: string): number | null | undefined {
	const t = text
		.trim()
		.replace(/,/g, '.')
		.replace(/^(?:t|f)\s*\/?\s*/i, '')
		.replace(/\s*(?:mm|k|°|deg|fps)$/i, '');
	if (NONE.test(t)) return undefined;
	if (!NUMBER.test(t)) return null;
	const n = Number(t);
	return n === 0 ? undefined : n;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** `fps`: the frame rate a shutter speed is turned into an angle at. */
export function readTakeValue(key: CameraValueKey, text: string, fps: Rational): FieldValue | null | undefined {
	let value: FieldValue | null | undefined;
	if (key === 'captureFrameRate') {
		value = NONE.test(text.trim()) || number(text) === undefined ? undefined : readRate(text);
	} else if (key === 'shutterAngle' && SPEED.test(text.trim())) {
		const per = Number(SPEED.exec(text.trim())![1]);
		value = per > 0 ? round((360 * fps.num) / fps.denom / per, 1) : null;
	} else {
		value = number(text);
	}
	if (value === undefined || value === null) return value;
	return validateValue(findField('take', key)!.def, value).length ? null : value;
}
