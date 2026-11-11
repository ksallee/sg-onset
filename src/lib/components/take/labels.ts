// Labels the take table needs from the catalogue: the short label (at most 8 characters), its end
// form, and the unit beside a value in the units set. Pure.
import type { FieldDef } from '$lib/model/catalogue';
import type { UnitSystem } from '$lib/model/length';
import { t } from '$lib/i18n/messages';
import { fieldShortLabel, unitLabel } from '$lib/i18n/modelText';
import { unitOf } from '$lib/take/fields';

export const shortLabel = fieldShortLabel;

export function unitText(def: FieldDef, units: UnitSystem): string {
	return unitLabel(unitOf(def, units));
}

/** A value with its unit for a screen reader: "4.2 m", "12°", "Not set". */
export function spoken(value: string, def: FieldDef, units: UnitSystem): string {
	if (!value) return t('take.empty');
	const unit = unitText(def, units);
	return unit ? (unit === '°' ? `${value}${unit}` : `${value} ${unit}`) : value;
}
