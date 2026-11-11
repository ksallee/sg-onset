// Recent values of a take's number, for the dock's chips: what the takes of the slate hold,
// newest first, each value once. Read from the stored takes, so they survive a reload. Pure.

import { sortTakes } from '$lib/app/takeRows';
import type { FieldDef } from '$lib/model/catalogue';
import { formatField } from '$lib/model/fieldText';
import type { UnitSystem } from '$lib/model/length';
import type { FieldValue, Take } from '$lib/model/types';
import { sameValue } from '$lib/model/value';

export const RECENT_CAP = 5;

/** `key` is the field's own key or its end key. Takes never started count as the newest. */
export function recentValues(takes: readonly Take[], def: FieldDef, key: string, units: UnitSystem, cap = RECENT_CAP): { text: string; value: FieldValue }[] {
	const out: { text: string; value: FieldValue }[] = [];
	for (const take of sortTakes(takes).reverse()) {
		const value = (take as Record<string, unknown>)[key] as FieldValue | undefined;
		if (value === undefined || out.some((r) => sameValue(r.value, value))) continue;
		const text = formatField(def, value, units);
		// As the table and the keypad show it: a metric length has no unit word.
		out.push({ text: def.type === 'length' && units === 'metric' ? text.replace(/\s*m$/, '') : text, value });
		if (out.length >= cap) break;
	}
	return out;
}
