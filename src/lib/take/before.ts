// The take before, beside the take on screen (#52): for one camera, the take of the take number
// before, the one its changed marks compare with, and its values as the take table shows them.
// Pure.

import { fieldShortLabel, unitLabel } from '$lib/i18n/modelText';
import type { FieldDef } from '$lib/model/catalogue';
import type { UnitSystem } from '$lib/model/length';
import type { Lens, Take } from '$lib/model/types';
import { sameValue } from '$lib/model/value';
import { isLocked, shownValue, slotKey, unitOf } from './fields';
import type { TakeGroup } from './groups';

/** The take before on one camera: its take number and its record. */
export interface Before {
	number: string;
	take: Take;
}

/**
 * The camera's take on the take number before the one on screen. None for the first take, and
 * when that camera was not on the take before: the changed marks have nothing to compare with then.
 */
export function takeBefore(groups: readonly TakeGroup[], group: TakeGroup | undefined, setupId: string): Before | undefined {
	const i = group ? groups.indexOf(group) : -1;
	const prev = i > 0 ? groups[i - 1] : undefined;
	const take = prev?.bySetup[setupId];
	return prev && take ? { number: prev.number, take } : undefined;
}

/** The value, or its end, differs from the take before. Never for a value from the lens. */
export function changedSince(def: FieldDef, take: Take | undefined, before: Take | undefined, lens: Lens | undefined): boolean {
	if (!take || !before || isLocked(def, lens)) return false;
	const rec = (r: Take, key: string) => (r as Record<string, unknown>)[key];
	return !sameValue(rec(take, def.key), rec(before, def.key)) || !sameValue(rec(take, slotKey(def.key, true)), rec(before, slotKey(def.key, true)));
}

export interface BeforeRow {
	key: string;
	/** The field's short label, as the table's rows say it. */
	label: string;
	/** "4.2 m", "150 → 85 mm", "-3°", "∞", "6' 2"", or "–" for none. */
	value: string;
	/** The take on screen differs here: the table's diamond. */
	changed: boolean;
}

/** A value and its unit: no space before °, none after ∞ or none. */
function withUnit(text: string, unit: string): string {
	if (!unit || text === '∞') return text;
	return unit === '°' ? `${text}${unit}` : `${text} ${unit}`;
}

/** One row per field the table shows: the take before's value with its unit, and whether the take on screen changed it. */
export function beforeRows(fields: readonly FieldDef[], before: Take, beforeLens: Lens | undefined, now: Take | undefined, nowLens: Lens | undefined, units: UnitSystem): BeforeRow[] {
	return fields.map((def) => {
		const start = shownValue(def, before, beforeLens, units);
		const end = def.end ? shownValue(def, before, beforeLens, units, true) : '';
		const unit = unitLabel(unitOf(def, units));
		const value = !start ? '–' : withUnit(end ? `${start} → ${end}` : start, unit);
		return { key: def.key, label: fieldShortLabel(def), value, changed: changedSince(def, now, before, nowLens) };
	});
}
