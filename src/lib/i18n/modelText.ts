// The model speaks in message keys: field labels, validation issues, import issues. These turn
// them into text. Pure.
import type { FieldDef, Unit } from '$lib/model/catalogue';
import type { ImportIssue } from '$lib/model/gearImport';
import type { Issue } from '$lib/model/validate';
import { hasMessage, tk, t, type Params } from './messages';

/** The label of a catalogue field; of its end value with `end`. */
export function fieldLabel(def: Pick<FieldDef, 'labelKey'>, end = false): string {
	const label = tk(def.labelKey);
	return end ? t('field.end', { field: label }) : label;
}

/** The short label of a field, for the dense take table; the long one where it has none. */
export function fieldShortLabel(def: Pick<FieldDef, 'labelKey'>, end = false): string {
	const key = `${def.labelKey}.short`;
	if (!hasMessage(key)) return fieldLabel(def, end);
	const label = t(key);
	return end ? t('field.end.short', { field: label }) : label;
}

/** The label of one option of an enum field. */
export function optionLabel(def: Pick<FieldDef, 'labelKey'>, option: string): string {
	return tk(`${def.labelKey}.${option}`);
}

/** A stored unit as it is shown: mm, m, °, fps, K, px. */
export function unitLabel(unit: Unit | string | undefined): string {
	return unit ? tk(`unit.${unit}`) : '';
}

/** A unit after a number: "5 mm", "90°". */
function unitSuffix(unit: unknown): string {
	if (typeof unit !== 'string' || unit === '') return '';
	const label = unitLabel(unit);
	return unit === 'deg' ? label : ` ${label}`;
}

/** What a validation issue says. */
export function issueText(issue: Issue): string {
	const params: Params = { ...issue.params, unit: unitSuffix(issue.params?.unit) };
	if (typeof params.type === 'string') params.type = tk(`validation.typeName.${params.type}`);
	return tk(issue.key, params);
}

/** What one line of a gear import report says. */
export function importIssueText(issue: Pick<ImportIssue, 'key' | 'row' | 'column' | 'value'>): string {
	return tk(issue.key, { row: issue.row, column: issue.column ?? '', value: issue.value ?? '' });
}
