// Timecode as the DIT's file gives it, beside the frame maths of `$lib/export/timecode`: the rate,
// the text tidied, the time of day it names, the last frame from an ALE End or a duration, and the
// local time of day of a take's stamp. Pure: the time zone is passed in.

import { parseFrameRate, type Rational } from '$lib/model/rational';

/** The rate a cell or the ALE heading gives: "24", "25.000", "23.976". Null when none. */
export function readRate(text: string | undefined): Rational | null {
	if (!text) return null;
	const rate = parseFrameRate(text);
	if (!rate) return null;
	const fps = rate.num / rate.denom;
	return fps >= 1 && fps <= 240 ? rate : null;
}

/** Usual timecode rates, as a guess when the file names none. */
const GUESSES = [24, 25, 30, 50, 60];

/** The smallest usual rate above every frame number seen: 24 when none passes 23. */
export function guessRate(timecodes: readonly string[]): Rational {
	let most = 0;
	for (const tc of timecodes) {
		const frames = tidyTimecode(tc);
		if (frames) most = Math.max(most, Number(frames.text.slice(-2)));
	}
	return { num: GUESSES.find((base) => base > most) ?? 60, denom: 1 };
}

const TC = /^(\d{2})[:;.,](\d{2})[:;.,](\d{2})([:;.,])(\d{2})$/;

/** Timecode text with colons, or a semicolon before the frames for drop frame. Null when not timecode. */
export function tidyTimecode(text: string): { text: string; dropFrame: boolean } | null {
	const m = TC.exec(text.trim());
	if (!m) return null;
	const dropFrame = m[4] === ';';
	return { text: `${m[1]}:${m[2]}:${m[3]}${dropFrame ? ';' : ':'}${m[5]}`, dropFrame };
}

/** The time of day a timecode names, in seconds since midnight, its frames a fraction of a second. */
export function clockSeconds(text: string, base: number): number | null {
	const m = TC.exec(text.trim());
	if (!m) return null;
	return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[5]) / base;
}

/**
 * The last frame of a clip, from its first frame and its ALE End (the frame after the last), or
 * its duration in frames. When the duration says the End is the last frame itself, it is read
 * so. Frame counts wrap at `day`, the frames in 24 hours.
 */
export function lastFrame(start: number, end: number | undefined, duration: number | undefined, day: number): number | undefined {
	let last: number;
	if (end !== undefined) {
		const unwrapped = end < start ? end + day : end;
		last = duration !== undefined && unwrapped - start + 1 === duration ? unwrapped : Math.max(start, unwrapped - 1);
	} else if (duration !== undefined && duration > 0) {
		last = start + duration - 1;
	} else {
		return undefined;
	}
	return last % day;
}

/** The time of day of a stored timestamp, in seconds since midnight, at `offsetMinutes` east of UTC. */
export function localSeconds(timestamp: string | undefined, offsetMinutes: number): number | undefined {
	const ms = Date.parse(timestamp ?? '');
	if (Number.isNaN(ms)) return undefined;
	const day = 86400;
	return (((ms / 1000 + offsetMinutes * 60) % day) + day) % day;
}
