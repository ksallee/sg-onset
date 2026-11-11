// Validation from the catalogue: type, range and unit of a stored value. Issues are message keys
// with parameters, never English. Pure.

import { endKey, fieldsOf, type FieldDef, type Scope } from './catalogue';

/** One thing wrong with a value. `key` is a message key; `params` fill its placeholders. */
export type Issue = { key: string; params?: Record<string, string | number> };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const TIMECODE = /^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Nothing stored: undefined, null, blank text, an empty list. */
function isMissing(value: unknown): boolean {
	if (value == null) return true;
	if (typeof value === 'string') return value.trim() === '';
	return Array.isArray(value) && value.length === 0;
}

function isDate(text: string): boolean {
	const m = DATE.exec(text);
	if (!m) return false;
	const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const d = new Date(Date.UTC(year, month - 1, day));
	return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function isTimecode(text: string): boolean {
	const m = TIMECODE.exec(text);
	return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59 && Number(m[3]) <= 59;
}

/** The first bound of `def` that `n` breaks, if any. */
function range(def: FieldDef, n: number): Issue[] {
	const unit: Record<string, string> = def.unit ? { unit: def.unit } : {};
	if (def.above !== undefined && n <= def.above) return [{ key: 'validation.above', params: { above: def.above, ...unit } }];
	if (def.min !== undefined && n < def.min) return [{ key: 'validation.min', params: { min: def.min, ...unit } }];
	if (def.max !== undefined && n > def.max) return [{ key: 'validation.max', params: { max: def.max, ...unit } }];
	return [];
}

/**
 * What is wrong with `value` as a stored value of field `def`: none, or one issue. Keys:
 * validation.required, .type {type}, .integer, .above {above, unit}, .min {min, unit},
 * .max {max, unit}, .infinity, .unit, .rational, .option {options}, .date, .timestamp, .timecode.
 */
export function validateValue(def: FieldDef, value: unknown): Issue[] {
	if (isMissing(value)) return def.required ? [{ key: 'validation.required' }] : [];
	const wrongType: Issue[] = [{ key: 'validation.type', params: { type: def.type } }];
	switch (def.type) {
		case 'string':
		case 'ref':
			return typeof value === 'string' ? [] : wrongType;
		case 'date':
			if (typeof value !== 'string') return wrongType;
			return isDate(value) ? [] : [{ key: 'validation.date' }];
		case 'timestamp':
			if (typeof value !== 'string') return wrongType;
			return TIMESTAMP.test(value) && isDate(value.slice(0, 10)) && !Number.isNaN(Date.parse(value)) ? [] : [{ key: 'validation.timestamp' }];
		case 'timecode':
			if (typeof value !== 'string') return wrongType;
			return isTimecode(value) ? [] : [{ key: 'validation.timecode' }];
		case 'enum':
			if (typeof value !== 'string') return wrongType;
			return def.options?.includes(value) ? [] : [{ key: 'validation.option', params: { options: (def.options ?? []).join(', ') } }];
		case 'boolean':
			return typeof value === 'boolean' ? [] : wrongType;
		case 'integer':
		case 'number':
			if (!isNumber(value)) return wrongType;
			if (def.type === 'integer' && !Number.isInteger(value)) return [{ key: 'validation.integer' }];
			return range(def, value);
		case 'length': {
			if (!isObject(value) || !(isNumber(value.m) || value.m === 'inf')) return wrongType;
			const entered = value.entered;
			if (entered !== undefined) {
				const known = isObject(entered) && typeof entered.text === 'string' && (entered.system === 'imperial' || entered.system === 'metric');
				if (!known) return [{ key: 'validation.unit' }];
			}
			if (value.m === 'inf') return def.infinity ? [] : [{ key: 'validation.infinity' }];
			return range(def, value.m as number);
		}
		case 'rational': {
			if (!isObject(value) || typeof value.num !== 'number' || typeof value.denom !== 'number') return wrongType;
			const whole = (n: number) => Number.isInteger(n) && n >= 1;
			return whole(value.num) && whole(value.denom) ? [] : [{ key: 'validation.rational' }];
		}
		case 'dimensions': {
			if (!isObject(value) || !isNumber(value.width) || !isNumber(value.height)) return wrongType;
			const sides = [value.width, value.height];
			if (def.unit === 'px' && !sides.every(Number.isInteger)) return [{ key: 'validation.integer' }];
			return sides.some((n) => n < 0) ? [{ key: 'validation.min', params: { min: 0, ...(def.unit ? { unit: def.unit } : {}) } }] : [];
		}
		case 'stringList':
			return Array.isArray(value) && value.every((v) => typeof v === 'string') ? [] : wrongType;
	}
}

/**
 * The issues of a record, by field key; a field with none is absent. End values are checked
 * under their end key and never required. Also checks across fields: a take must not end before
 * it starts (validation.endBeforeStart on endedAt), a zoom's long end must not be under its short
 * end (validation.focalRange on focalLengthMax). Keys the catalogue does not know are ignored.
 */
export function validateRecord(scope: Scope, record: object): Record<string, Issue[]> {
	const values = record as Record<string, unknown>;
	const out: Record<string, Issue[]> = {};
	for (const def of fieldsOf(scope)) {
		const issues = validateValue(def, values[def.key]);
		if (issues.length) out[def.key] = issues;
		if (!def.end) continue;
		const endIssues = validateValue({ ...def, required: undefined }, values[endKey(def.key)]);
		if (endIssues.length) out[endKey(def.key)] = endIssues;
	}
	const { startedAt, endedAt, focalLength, focalLengthMax } = values;
	if (scope === 'take' && typeof startedAt === 'string' && typeof endedAt === 'string' && !out.startedAt && !out.endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
		out.endedAt = [{ key: 'validation.endBeforeStart' }];
	}
	if (scope === 'lens' && isNumber(focalLength) && isNumber(focalLengthMax) && !out.focalLengthMax && focalLengthMax < focalLength) {
		out.focalLengthMax = [{ key: 'validation.focalRange' }];
	}
	return out;
}
