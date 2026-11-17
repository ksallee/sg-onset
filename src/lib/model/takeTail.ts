// What a take caught at its tail: the camera kept running after the action for a clean plate, or
// for the grey and chrome balls and the colour chart. Either or both, beside the take's one type.
// No value is none. A plate at the tail turns on the switches its take type would (takeType.ts).
// Pure.

import { FIELDS } from './catalogue';
import { change, type Patch } from './patch';
import type { Take } from './types';
import { sameValue } from './value';

type TakeTailDef = Extract<(typeof FIELDS)[number], { scope: 'take'; key: 'takeTail' }>;

/** Every plate a tail can hold, as the catalogue lists them. */
export const TAKE_TAILS: TakeTailDef['options'] = FIELDS.find((d): d is TakeTailDef => d.scope === 'take' && d.key === 'takeTail')!.options;
export type TakeTail = TakeTailDef['options'][number];

type Tailed = { takeTail?: readonly string[] };

const itemsOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** The plates at the tail of a take, in the catalogue's order. A plate this version does not know is left out. */
export function takeTailOf(take: Tailed): TakeTail[] {
	const held = new Set(itemsOf(take.takeTail));
	return TAKE_TAILS.filter((t) => held.has(t));
}

/** The value stored for a tail: its plates once each, in the catalogue's order, then any other as it was. None is no value. */
export function storedTakeTail(list: readonly string[] | undefined): string[] | undefined {
	const items = itemsOf(list).filter((v): v is string => typeof v === 'string');
	const known = TAKE_TAILS.filter((t) => items.includes(t));
	const other = [...new Set(items.filter((v) => !(TAKE_TAILS as readonly string[]).includes(v)))];
	const all = [...known, ...other];
	return all.length ? all : undefined;
}

/** Puts one plate at the tail of every take given, or takes it off: every camera of one take number. The other plate stays as it is. */
export function tailPatch(takes: readonly Take[], tail: TakeTail, on: boolean): Patch {
	const patch = [];
	for (const take of takes) {
		const items = itemsOf(take.takeTail).filter((v): v is string => typeof v === 'string' && v !== tail);
		const to = storedTakeTail(on ? [...items, tail] : items);
		if (!sameValue(take.takeTail, to)) patch.push(change(take, 'takeTail', to));
	}
	return patch;
}

/** The plates every take given has at its tail. None for no take. */
export function groupTail(takes: readonly Tailed[]): TakeTail[] {
	if (!takes.length) return [];
	return TAKE_TAILS.filter((t) => takes.every((take) => takeTailOf(take).includes(t)));
}
