// Labels the take table needs from the catalogue: the short label (at most 8 characters), its end
// form, the unit beside a value in the units set, a camera column's name and what a screen reader
// says for a cell. Pure.
import type { FieldDef } from '$lib/model/catalogue';
import type { UnitSystem } from '$lib/model/length';
import { t } from '$lib/i18n/messages';
import { fieldShortLabel, unitLabel } from '$lib/i18n/modelText';
import { unitOf } from '$lib/take/fields';
import { NO_SETUP, type Column } from '$lib/take/groups';

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

/** A camera column as said: "Cam A"; a take with no setup; a setup a take is on that Gear no longer has. */
export function cameraName(col: Column): string {
	if (col.label) return t('take.setup', { id: col.label });
	return col.id === NO_SETUP ? t('take.setup.none') : t('take.setup.gone');
}

export interface CellSay {
	camera: string;
	field: string;
	/** The value with its unit, as `spoken` gives it. */
	value: string;
	/** The end value of a value that changed over the take. */
	end?: { field: string; value: string };
	/** From the lens: a prime's focal length. */
	locked?: boolean;
	/** Differs from the same camera's take before: the cell's mark. */
	changed?: boolean;
}

/** What a screen reader says for a cell of the take table: all the cell shows, its marks too. */
export function cellLabel(cell: CellSay): string {
	const parts = [t(cell.locked ? 'take.cell.locked' : 'take.cell', { camera: cell.camera, field: cell.field, value: cell.value })];
	if (cell.end) parts.push(`${cell.end.field} ${cell.end.value}`);
	if (cell.changed) parts.push(t('take.cell.changed'));
	return parts.join(', ');
}
