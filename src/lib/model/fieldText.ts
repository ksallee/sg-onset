// Text in, stored value out, and back: what a form field, a bulk edit or a CSV cell needs. Driven
// by the catalogue. Pure.

import type { FieldDef } from './catalogue';
import { formatLength, parseLength, type Length, type UnitSystem } from './length';
import { formatRational, parseFrameRate, parseRational, type Rational } from './rational';
import type { Dimensions, FieldValue } from './types';
import { validateValue, type Issue } from './validate';

export type Parsed = { ok: true; value: FieldValue | undefined } | { ok: false; issue: Issue };

const NUM = String.raw`[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)`;
/** A number, with an optional lead like T, f/ or ISO and an optional unit after: T2.8, 32mm, 180°. */
const NUMBER = new RegExp(String.raw`^(?:[a-z]+\s*\/?\s*)?(${NUM})\s*[a-z°]*$`, 'i');
const DIMENSIONS = new RegExp(String.raw`^(${NUM})\s*[x×*]\s*(${NUM})\s*(?:mm|px)?$`, 'i');
const YES = ['yes', 'y', 'true', '1', 'x'];
const NO = ['no', 'n', 'false', '0'];

const toNumber = (text: string) => Number(text.replace(',', '.'));
const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '');

/** The stored value `text` spells for a field of this type, or null when it spells none. */
function read(def: FieldDef, text: string, system: UnitSystem): FieldValue | null {
	switch (def.type) {
		case 'string':
		case 'ref':
		case 'date':
		case 'timestamp':
		case 'timecode':
			return text;
		case 'enum':
			return def.options?.find((option) => squash(option) === squash(text)) ?? text;
		case 'integer':
		case 'number': {
			const m = NUMBER.exec(text);
			return m ? toNumber(m[1]) : null;
		}
		case 'boolean':
			return YES.includes(text.toLowerCase()) ? true : NO.includes(text.toLowerCase()) ? false : null;
		case 'length':
			return parseLength(text, system);
		case 'rational':
			return def.unit === 'Hz' ? parseFrameRate(text) : parseRational(text.replace(/\s*(x|×|:\s*1)$/i, ''));
		case 'dimensions': {
			const m = DIMENSIONS.exec(text);
			return m ? { width: toNumber(m[1]), height: toNumber(m[2]) } : null;
		}
		case 'stringList':
			return text
				.split(/[,;\v]/)
				.map((item) => item.trim())
				.filter((item) => item !== '');
	}
}

/**
 * Reads what was typed into a field. Empty text is no value. A bare length is feet in `system`
 * imperial and metres in metric. Text that does not read, or reads as a value the catalogue rules
 * out, comes back as the issue, a message key.
 */
export function parseField(def: FieldDef, text: string, system: UnitSystem): Parsed {
	const typed = text.trim();
	if (typed === '') return { ok: true, value: undefined };
	const value = read(def, typed, system);
	if (value === null) return { ok: false, issue: { key: 'validation.type', params: { type: def.type } } };
	const [issue] = validateValue(def, value);
	return issue ? { ok: false, issue } : { ok: true, value };
}

/**
 * A stored value as text that `parseField` reads back. No unit is added to a number: the form
 * shows the catalogue's unit beside it. A length shows in `system`, as typed when it can.
 */
export function formatField(def: FieldDef, value: unknown, system: UnitSystem): string {
	if (value == null) return '';
	switch (def.type) {
		case 'boolean':
			return value ? 'yes' : 'no';
		case 'length':
			return formatLength(value as Length, system);
		case 'rational':
			return formatRational(value as Rational);
		case 'dimensions':
			return `${(value as Dimensions).width} x ${(value as Dimensions).height}`;
		case 'stringList':
			return (value as string[]).join(', ');
		default:
			return String(value);
	}
}
