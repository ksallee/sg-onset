// Take numbering and the copy a new take starts from. Pure.
import type { Take } from './types';

/**
 * The take after `take`: the last number in it goes up by one, its prefix and zero padding stay,
 * anything after it goes ("3A" → "4"). No number: the second of its kind ("Wild" → "Wild 2").
 */
export function nextTakeNumber(take: string): string {
	const m = /^(.*?)(\d+)\D*$/.exec(take);
	if (!m) return take ? `${take} 2` : '2';
	const [, prefix, digits] = m;
	return prefix + String(Number(digits) + 1).padStart(digits.length, '0');
}

/** A new take is a copy of the last: same scene, slate and camera values, the next number, not rolled, no stills. */
export function copyOfLast(last: Take, id: string): Take {
	return {
		id,
		scene: last.scene,
		slate: last.slate,
		take: nextTakeNumber(last.take),
		cameras: { A: { ...last.cameras.A }, B: { ...last.cameras.B }, C: { ...last.cameras.C } },
		start: null,
		end: null,
		stills: []
	};
}
