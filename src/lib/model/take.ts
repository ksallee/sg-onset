// Take logic: the next take number, a new take as a copy of the last, and the focal length a take
// was shot at. Pure: the caller passes the new id.

import { endKey, fieldsOf } from './catalogue';
import type { Lens, Take } from './types';

/** Steps a run of letters like a spreadsheet column, keeping case: b → c, z → aa, Z → AA. */
function nextLetters(letters: string): string {
	const chars = [...letters];
	for (let i = chars.length - 1; i >= 0; i--) {
		const c = chars[i];
		if (c !== 'z' && c !== 'Z') {
			chars[i] = String.fromCharCode(c.charCodeAt(0) + 1);
			return chars.join('');
		}
		chars[i] = c === 'z' ? 'a' : 'A';
	}
	return chars[0] + chars.join('');
}

/**
 * The take number after `take`. Take numbers are strings; the rule, first match wins:
 * 1. Nothing: "1".
 * 2. Ends in a number: that number plus one, leading zeros kept. "3" → "4", "A7" → "A8",
 *    "007" → "008".
 * 3. Ends in letters right after a number: the letters step. "12b" → "12c", "12z" → "12aa".
 * 4. Anything else: "2" is appended, and rule 2 counts from there. "PU" → "PU2" → "PU3".
 */
export function nextTakeNumber(take: string): string {
	const t = take.trim();
	if (t === '') return '1';
	const number = /^(.*?)(\d+)$/.exec(t);
	if (number) {
		const [, head, digits] = number;
		return head + String(BigInt(digits) + 1n).padStart(digits.length, '0');
	}
	const letters = /^(.*\d)([A-Za-z]+)$/.exec(t);
	if (letters) return letters[1] + nextLetters(letters[2]);
	return `${t}2`;
}

/**
 * A new take as a copy of the last: same slate, template link, camera, lens and settings; a new
 * id and the next number. Fields the catalogue marks `carry: false` belong to one take and are
 * left out.
 */
export function nextTake(last: Take, id: string): Take {
	const next: Record<string, unknown> = { ...last, id, take: nextTakeNumber(last.take ?? '') };
	for (const def of fieldsOf('take')) {
		if (def.carry !== false || def.key === 'take') continue;
		delete next[def.key];
		if (def.end) delete next[endKey(def.key)];
	}
	return next as Take;
}

/** A lens with a focal range. */
export function isZoom(lens: Lens): boolean {
	return lens.focalLength !== undefined && lens.focalLengthMax !== undefined && lens.focalLengthMax !== lens.focalLength;
}

/** A lens with one focal length. */
export function isPrime(lens: Lens): boolean {
	return lens.focalLength !== undefined && !isZoom(lens);
}

/**
 * The focal length a take was shot at, in mm, start and end. A prime gives its own focal length,
 * whatever the take holds. A zoom, or no lens, gives what was typed on the take; the end is the
 * start when no end was typed. Undefined when nothing is known.
 */
export function effectiveFocalLength(take: Take, lens: Lens | undefined): { start: number; end: number; source: 'lens' | 'take' } | undefined {
	if (lens && isPrime(lens)) return { start: lens.focalLength!, end: lens.focalLength!, source: 'lens' };
	if (take.focalLength === undefined) return undefined;
	return { start: take.focalLength, end: take.focalLengthEnd ?? take.focalLength, source: 'take' };
}
