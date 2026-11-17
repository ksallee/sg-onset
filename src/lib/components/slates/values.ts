// A stored value as text for a label, a table cell or a review line: in the units of the
// settings, enum options and refs by their names, yes and no in words. Thin over the model's
// formatField and the i18n helpers.

import type { Scope } from '$lib/model/catalogue';
import { formatField } from '$lib/model/fieldText';
import type { UnitSystem } from '$lib/model/length';
import { takeTypeOf } from '$lib/model/takeType';
import { t } from '$lib/i18n/messages';
import { fieldLabel, optionLabel, unitLabel } from '$lib/i18n/modelText';
import type { FieldRef } from '$lib/slates/fields';
import { fieldRef } from '$lib/slates/fields';

/** Names of the records a ref can point at, by id. */
export type Names = ReadonlyMap<string, string>;

export function valueText(ref: FieldRef, value: unknown, units: UnitSystem, names?: Names): string {
	const { def } = ref;
	// A take with no type is Main.
	if (def.scope === 'take' && def.key === 'takeType') value = takeTypeOf({ takeType: value as string | undefined });
	if (value === undefined || value === null || value === '') return '';
	switch (def.type) {
		case 'boolean':
			return value ? t('slates.field.yes') : t('slates.field.no');
		case 'enum':
			return optionLabel(def, String(value));
		case 'stringList':
			// A list of options, the plates at a take's tail: by their labels.
			if (def.options && Array.isArray(value)) return value.map((v) => optionLabel(def, String(v))).join(', ');
			return formatField(def, value, units);
		case 'ref':
			return names?.get(String(value)) ?? '';
		case 'length':
			return formatField(def, value, units);
		default: {
			const text = formatField(def, value, units);
			if (!def.unit || def.unit === 'm') return text;
			return def.unit === 'deg' ? `${text}${unitLabel(def.unit)}` : `${text} ${unitLabel(def.unit)}`;
		}
	}
}

/** The label of a key of a scope: "Tilt", "Tilt, end". */
export function keyLabel(scope: Scope, key: string): string {
	const ref = fieldRef(scope, key);
	return ref ? fieldLabel(ref.def, ref.end) : key;
}

/** A value of a key of a scope as text. */
export function keyValueText(scope: Scope, key: string, value: unknown, units: UnitSystem, names?: Names): string {
	const ref = fieldRef(scope, key);
	return ref ? valueText(ref, value, units, names) : String(value ?? '');
}
