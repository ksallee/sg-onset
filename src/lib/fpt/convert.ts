// Values, both ways: our stored form to what a Flow Production Tracking field takes, and what it
// answers back to our form. One value per column of the field map. Links are not here: they need
// server ids, see payload.ts. Pure.
//
// What each FPT data type takes and answers is from the corpus, findings/field_types/*.md.

import { metres, type Length } from '$lib/model/length';
import { parseRational, rational, type Rational } from '$lib/model/rational';
import type { Dimensions } from '$lib/model/types';
import type { FieldMap } from './mapping';

/**
 * Focus at infinity, in metres. A float field holds no infinity, and null means "not noted".
 * A billion metres is past any lens and sorts after every real distance.
 */
export const INFINITY_M = 1_000_000_000;

export type Written = unknown[] | { error: string };

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A float field refuses a JSON integer and takes a numeric string; it keeps six decimals
 * (field_types/float.md). So every float goes as a string with a decimal point.
 */
function floatOut(n: number): string {
	const rounded = Number(n.toFixed(6)) + 0;
	return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
}

function floatIn(raw: unknown): number | undefined {
	if (raw === null || raw === undefined || raw === '') return undefined;
	const n = typeof raw === 'number' ? raw : Number(raw);
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Our value as the values of the map's columns, in column order. `null` clears a field; a
 * checkbox has no null and takes false (field_types/checkbox.md). A value of the wrong shape is
 * an error, never a guess.
 */
export function writeValue(map: FieldMap, value: unknown): Written {
	const bad = (): Written => ({ error: `${map.scope}.${map.key}: ${JSON.stringify(value)} is not a ${map.kind} value` });
	const missing = value === undefined || value === null;
	switch (map.kind) {
		case 'text':
		case 'date':
			if (missing || value === '') return [null];
			return typeof value === 'string' ? [value] : bad();
		case 'stringList': {
			if (missing) return [null];
			if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) return bad();
			return [value.length ? value.join(', ') : null];
		}
		case 'timestamp': {
			if (missing) return [null];
			const time = typeof value === 'string' ? Date.parse(value) : NaN;
			// Stored to the second, in UTC (field_types/date_time.md).
			return Number.isNaN(time) ? bad() : [new Date(time).toISOString().slice(0, 19) + 'Z'];
		}
		case 'integer':
			// A number field refuses a Float (field_types/number.md).
			if (missing) return [null];
			return isNumber(value) && Number.isInteger(value) ? [value] : bad();
		case 'number':
			if (missing) return [null];
			return isNumber(value) ? [floatOut(value)] : bad();
		case 'boolean':
			if (missing) return [false];
			return typeof value === 'boolean' ? [value] : bad();
		case 'length': {
			if (missing) return [null];
			const m = isObject(value) ? value.m : undefined;
			if (m === 'inf') return [floatOut(INFINITY_M)];
			return isNumber(m) ? [floatOut(m)] : bad();
		}
		case 'rational': {
			if (missing) return [null];
			if (!isObject(value) || !isNumber(value.num) || !isNumber(value.denom) || value.denom === 0) return bad();
			return [`${value.num}/${value.denom}`];
		}
		case 'dimensions': {
			if (missing) return [null, null];
			if (!isObject(value) || !isNumber(value.width) || !isNumber(value.height)) return bad();
			const integer = map.columns[0].dataType === 'number';
			if (integer && !(Number.isInteger(value.width) && Number.isInteger(value.height))) return bad();
			return integer ? [value.width, value.height] : [floatOut(value.width), floatOut(value.height)];
		}
		case 'ref':
			return { error: `${map.scope}.${map.key} is a link` };
	}
}

/**
 * The values of the map's columns, as the server answers them, in our form. A cleared field is a
 * missing value. An unticked checkbox is a missing value too: the server cannot tell "no" from
 * "not noted", and a missing value is how the model stores both.
 */
export function readValue(map: FieldMap, raw: readonly unknown[]): unknown {
	const [first, second] = raw;
	switch (map.kind) {
		case 'text':
		case 'date':
		case 'timestamp':
			return typeof first === 'string' && first !== '' ? first : undefined;
		case 'stringList': {
			if (typeof first !== 'string') return undefined;
			const items = first
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			return items.length ? items : undefined;
		}
		case 'integer':
		case 'number':
			return floatIn(first);
		case 'boolean':
			return first === true ? true : undefined;
		case 'length': {
			const m = floatIn(first);
			if (m === undefined) return undefined;
			const length: Length = map.infinity && m >= INFINITY_M ? { m: 'inf' } : metres(m);
			return length;
		}
		case 'rational': {
			if (typeof first !== 'string') return undefined;
			const fraction = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(first);
			const value: Rational | null = fraction && Number(fraction[2]) > 0 ? rational(Number(fraction[1]), Number(fraction[2])) : parseRational(first);
			return value ?? undefined;
		}
		case 'dimensions': {
			const width = floatIn(first);
			const height = floatIn(second);
			if (width === undefined || height === undefined) return undefined;
			const size: Dimensions = { width, height };
			return size;
		}
		case 'ref':
			return undefined;
	}
}
