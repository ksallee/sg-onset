// The takes shot for an element, by type: the takes typed other than Main, and with them each take
// that has that plate at its tail. What the Note on a Shot lists first (#97): artists rebuild
// these when they do not know they exist. Pure.

import { TAKE_TYPES, takeTypeOf, type TakeType } from './takeType';
import { takeTailOf } from './takeTail';
import type { Take } from './types';

export type ElementType = Exclude<TakeType, 'main'>;

/** One take shot for an element: typed so, or with the plate at its tail. */
export type ElementTake = { take: Take; tail: boolean };

/**
 * The takes given, by element type in the catalogue's order. Under a type, its takes in the order
 * given, typed or with the plate at the tail; a take typed so is listed once, as typed. A type no
 * take holds is left out, as are Main takes with nothing at the tail.
 */
export function takeElements(takes: readonly Take[]): { type: ElementType; takes: ElementTake[] }[] {
	const out: { type: ElementType; takes: ElementTake[] }[] = [];
	for (const type of TAKE_TYPES) {
		if (type === 'main') continue;
		const mine: ElementTake[] = [];
		for (const take of takes) {
			if (takeTypeOf(take) === type) mine.push({ take, tail: false });
			else if ((takeTailOf(take) as readonly string[]).includes(type)) mine.push({ take, tail: true });
		}
		if (mine.length) out.push({ type, takes: mine });
	}
	return out;
}
