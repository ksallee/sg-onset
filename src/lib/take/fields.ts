// The numbers of a take on the take screen, from the model's catalogue: which show, in what
// order, which are locked, how a value shows in the units set, and how the keypad types it.
// Pure.

import { endKey, fieldsOf, type FieldDef } from '$lib/model/catalogue';
import { formatField } from '$lib/model/fieldText';
import type { UnitSystem } from '$lib/model/length';
import { effectiveFocalLength, isPrime } from '$lib/model/take';
import type { Lens, Take } from '$lib/model/types';
import { THIRD_STOPS, type NumberSpec } from '$lib/ios/keypad';

/** What shows by default, in this order: what a wrangler writes on every take. */
export const DEFAULT_FIELDS = ['focalLength', 'focusDistance', 'tStop', 'lensHeight', 'tilt'] as const;

const NUMBER_TYPES = new Set(['number', 'integer', 'length', 'rational']);

/** Every number of a take in the catalogue: the default set first, then the rest in catalogue order. */
export function numberFields(): FieldDef[] {
	const all = fieldsOf('take').filter((d) => NUMBER_TYPES.has(d.type));
	const first = DEFAULT_FIELDS.map((key) => all.find((d) => d.key === key)!);
	return [...first, ...all.filter((d) => !first.includes(d))];
}

/** The default set, or every number. */
export function visibleFields(all: boolean): FieldDef[] {
	const fields = numberFields();
	return all ? fields : fields.slice(0, DEFAULT_FIELDS.length);
}

/** A prime's focal length comes from the lens: shown, never typed. */
export function isLocked(def: FieldDef, lens: Lens | undefined): boolean {
	return def.key === 'focalLength' && !!lens && isPrime(lens);
}

/** The key a value is stored under: its own, or `<key>End` for the end value. */
export function slotKey(key: string, end: boolean): string {
	return end ? endKey(key) : key;
}

/**
 * A value as the table shows it, '' for none. A prime's focal length is the lens's, with no end. A
 * length is in `units`, as typed when it can be; metric shows no unit word (the row says m).
 */
export function shownValue(def: FieldDef, take: Take, lens: Lens | undefined, units: UnitSystem, end = false): string {
	if (isLocked(def, lens)) return end ? '' : String(effectiveFocalLength(take, lens)!.start);
	const value = (take as Record<string, unknown>)[slotKey(def.key, end)];
	const text = formatField(def, value, units);
	return def.type === 'length' && units === 'metric' ? text.replace(/\s*m$/, '') : text;
}

/** The unit word beside a value: mm, m, °, fps, K. None for imperial lengths (6' 3" says it) or T-stops. */
export function unitOf(def: FieldDef, units: UnitSystem): string | undefined {
	if (def.type === 'length') return units === 'metric' ? 'm' : undefined;
	return def.unit;
}

/** How the dock types a field. `number`: the keypad's numbers. `feetInches`: 6' 3", with marks. */
export type EntrySpec = { mode: 'number'; spec: NumberSpec; infinity: boolean } | { mode: 'feetInches'; spec: NumberSpec; infinity: boolean };

/** Range, places, step and stops in the unit shown. Where the catalogue gives a range, it wins. */
const SPECS: Record<string, NumberSpec> = {
	focalLength: { min: 1, max: 2000, decimals: 1, step: 1 },
	tStop: { min: 0.7, max: 64, decimals: 1, step: 0.1, stops: THIRD_STOPS },
	focusDistance: { min: 0, max: 999, decimals: 2, step: 0.1 },
	lensHeight: { min: -99, max: 99, decimals: 2, step: 0.05 },
	distanceToSubject: { min: 0, max: 9999, decimals: 2, step: 0.5 },
	tilt: { min: -90, max: 90, decimals: 1, step: 1 },
	roll: { min: -180, max: 180, decimals: 1, step: 1 },
	shutterAngle: { min: 0, max: 360, decimals: 1, step: 1 },
	isoSpeed: { min: 1, max: 409600, decimals: 0, step: 100 },
	whiteBalance: { min: 1000, max: 20000, decimals: 0, step: 100 },
	captureFrameRate: { min: 1, max: 1000, decimals: 3, step: 1 }
};
const FALLBACK: NumberSpec = { min: 0, max: 99999, decimals: 2, step: 1 };

export function entrySpec(def: FieldDef, units: UnitSystem, lens: Lens | undefined): EntrySpec {
	const base = SPECS[def.key] ?? FALLBACK;
	const spec: NumberSpec = {
		...base,
		min: def.type === 'length' ? base.min : (def.min ?? base.min),
		max: def.type === 'length' ? base.max : (def.max ?? base.max),
		...(def.type === 'integer' ? { decimals: 0 } : {})
	};
	if (def.key === 'focalLength' && lens?.focalLength !== undefined && lens.focalLengthMax !== undefined) {
		spec.min = lens.focalLength;
		spec.max = lens.focalLengthMax;
	}
	const infinity = def.infinity === true;
	return def.type === 'length' && units === 'imperial' ? { mode: 'feetInches', spec, infinity } : { mode: 'number', spec, infinity };
}
