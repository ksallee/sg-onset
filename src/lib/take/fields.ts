// The number fields of a camera on a take: range, precision, step, unit. Pure.
import type { NumberSpec } from '$lib/ios/keypad';
import { formatNumber, THIRD_STOPS } from '$lib/ios/keypad';
import type { MessageKey } from '$lib/i18n/messages';
import { focalEditable, focalLengthOf } from './focal';
import type { CameraValues, FieldKey, Lens } from './types';

export interface FieldSpec extends NumberSpec {
	key: FieldKey;
	label: MessageKey;
	unit: MessageKey;
	/** The unit goes before the number: T 2.8. */
	unitFirst?: boolean;
}

/** The T-stop steps by third stops, as a lens ring and a camera mark them: T2.8 to T4 is three presses, not twelve. Any tenth can be typed. */
export const FIELDS: readonly FieldSpec[] = [
	{ key: 'focalLength', label: 'field.focalLength', unit: 'unit.mm', min: 1, max: 2000, decimals: 0, step: 1 },
	{ key: 'focusDistance', label: 'field.focusDistance', unit: 'unit.m', min: 0, max: 999.99, decimals: 2, step: 0.1 },
	{ key: 'tStop', label: 'field.tStop', unit: 'unit.t', unitFirst: true, min: 0.7, max: 64, decimals: 1, step: 0.1, stops: THIRD_STOPS },
	{ key: 'cameraHeight', label: 'field.cameraHeight', unit: 'unit.m', min: 0, max: 99.99, decimals: 2, step: 0.05 },
	{ key: 'tilt', label: 'field.tilt', unit: 'unit.deg', min: -90, max: 90, decimals: 1, step: 1 }
];

/** The spec of a field on a lens: a zoom's focal length keeps to the zoom's range. */
export function specFor(key: FieldKey, lens: Lens): FieldSpec {
	const spec = FIELDS.find((f) => f.key === key) as FieldSpec;
	return key === 'focalLength' && lens.kind === 'zoom' ? { ...spec, min: lens.min, max: lens.max } : spec;
}

/** Whether the field is typed: all but a prime's focal length. */
export const fieldEditable = (key: FieldKey, lens: Lens): boolean => key !== 'focalLength' || focalEditable(lens);

/** The fields the keypad's Next walks, in order. */
export const editableFields = (lens: Lens): FieldKey[] => FIELDS.map((f) => f.key).filter((k) => fieldEditable(k, lens));

/** The field after `key` for Next, or null after the last. */
export function nextField(key: FieldKey, lens: Lens): FieldKey | null {
	const keys = editableFields(lens);
	return keys[keys.indexOf(key) + 1] ?? null;
}

/** A field's value as shown: the lens gives a prime's focal length. */
export function fieldValue(values: CameraValues, key: FieldKey, lens: Lens): number | null {
	return key === 'focalLength' ? focalLengthOf(lens, values.focalLength) : values[key];
}

export const formatField = (value: number | null, spec: NumberSpec): string => (value === null ? '' : formatNumber(value, spec.decimals));
