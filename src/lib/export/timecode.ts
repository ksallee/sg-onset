// SMPTE timecode as frame counts, for ALE: non drop frame at any whole base, drop frame at 29.97
// and 59.94. Pure.

import type { Rational } from '$lib/model/rational';

/** The whole number of frames a second of timecode counts: 23.976 counts 24, 29.97 counts 30. */
export function timecodeBase(fps: Rational): number {
	return Math.round(fps.num / fps.denom);
}

/** Drop frame exists only for the 1000/1001 rates of 30 and 60. */
export function isDropFrameRate(fps: Rational): boolean {
	return fps.denom === 1001 && (fps.num === 30000 || fps.num === 60000);
}

/** Frame numbers dropped at the start of each minute, except every tenth: 2 at 30, 4 at 60. */
function dropped(base: number): number {
	return Math.round(base / 15);
}

const TC = /^(\d{2}):(\d{2}):(\d{2})[:;.,](\d{2})$/;

/** The frame count of `tc` from 00:00:00:00. Either separator reads. Null when it is not valid. */
export function parseTimecode(tc: string, base: number, dropFrame: boolean): number | null {
	const m = TC.exec(tc.trim());
	if (!m) return null;
	const [h, min, s, f] = m.slice(1).map(Number);
	if (min > 59 || s > 59 || f >= base) return null;
	const totalMinutes = h * 60 + min;
	if (!dropFrame) return (totalMinutes * 60 + s) * base + f;
	const drop = dropped(base);
	if (s === 0 && f < drop && min % 10 !== 0) return null;
	return (totalMinutes * 60 + s) * base + f - drop * (totalMinutes - Math.floor(totalMinutes / 10));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A frame count as timecode, wrapping at 24 hours. Drop frame uses ; before the frames. */
export function formatTimecode(frames: number, base: number, dropFrame: boolean): string {
	let f = frames;
	if (dropFrame) {
		const drop = dropped(base);
		const perTen = base * 600 - drop * 9;
		const perMinute = base * 60 - drop;
		const day = perTen * 6 * 24;
		f = ((f % day) + day) % day;
		const tens = Math.floor(f / perTen);
		const rest = f % perTen;
		f += drop * 9 * tens + (rest > drop ? drop * Math.floor((rest - drop) / perMinute) : 0);
	}
	const day = base * 86400;
	f = ((f % day) + day) % day;
	const h = Math.floor(f / (base * 3600));
	const min = Math.floor(f / (base * 60)) % 60;
	const s = Math.floor(f / base) % 60;
	return `${pad(h)}:${pad(min)}:${pad(s)}${dropFrame ? ';' : ':'}${pad(f % base)}`;
}
