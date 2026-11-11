// The "everything" CSV, for spreadsheets: one row per take, a column for every catalogue field and
// every end value, headed by the app's labels, the model keys, or both. Labels come in from the
// caller (the i18n helpers), so this stays pure.

import { endKey, FIELDS, type FieldDef, type Scope, type Unit } from '$lib/model/catalogue';
import { formatField } from '$lib/model/fieldText';
import type { Length, UnitSystem } from '$lib/model/length';
import { formatRational, type Rational } from '$lib/model/rational';
import type { Dimensions } from '$lib/model/types';
import { csvText } from './csvWrite';
import { lengthNumber, trimNumber } from './format';
import { rowValue, type FlatTake } from './selection';

/** What the caller passes from `$lib/i18n/modelText`: fieldLabel, the scope names, optionLabel, unitLabel. */
export type PlainLabels = {
	field(def: FieldDef, end: boolean): string;
	scope(scope: Scope): string;
	option(def: FieldDef, option: string): string;
	/** A unit as shown: mm, m, °, fps, K, px; and ft for lengths in feet. */
	unit(unit: Unit | 'ft'): string;
	yes: string;
	no: string;
	/** The header of a unit column. Default: "<header> (unit)". */
	unitHeader?(header: string): string;
};

export type PlainOptions = {
	labels: PlainLabels;
	/** Label row, model key row (take.focalLength), or both, labels first. */
	header: 'labels' | 'keys' | 'both';
	/** Units inside each cell ("35 mm"), or bare numbers with a unit column after. */
	units: 'inline' | 'columns';
	/** How lengths show. Inline, a length typed in this system shows as typed. */
	lengths: UnitSystem;
	/** A byte order mark, so Excel reads UTF-8. Default false. */
	bom?: boolean;
	/** Quote-prefix cells a spreadsheet would run. Default true. */
	guardFormulas?: boolean;
};

/** Scopes in the order a person reads a take: where, what, then the gear. */
const SCOPE_ORDER: Scope[] = ['project', 'shootDay', 'slate', 'lightingSetup', 'cameraSetup', 'take', 'camera', 'lens'];

export type PlainColumn = {
	key: string;
	header: string;
	def: FieldDef;
	end: boolean;
	/** A unit column: holds the unit of the column before it. */
	unitOf?: string;
};

/** The unit a value of this field shows in, under these options. */
function unitOf(def: FieldDef, lengths: UnitSystem): Unit | 'ft' | undefined {
	if (def.type === 'length') return lengths === 'metric' ? 'm' : 'ft';
	return def.unit;
}

/** The columns, in order. A label two fields share gets its scope in front, so headers stay unique. */
export function plainColumns(options: Pick<PlainOptions, 'labels' | 'units' | 'lengths'>): PlainColumn[] {
	const { labels } = options;
	const fields: { def: FieldDef; end: boolean }[] = [];
	for (const scope of SCOPE_ORDER) {
		for (const def of FIELDS as readonly FieldDef[]) {
			if (def.scope !== scope) continue;
			fields.push({ def, end: false });
			if (def.end) fields.push({ def, end: true });
		}
	}
	const label = (f: { def: FieldDef; end: boolean }) => labels.field(f.def, f.end);
	const counts = new Map<string, number>();
	for (const f of fields) counts.set(label(f), (counts.get(label(f)) ?? 0) + 1);
	const unitHeader = labels.unitHeader ?? ((h: string) => `${h} (unit)`);

	const columns: PlainColumn[] = [];
	for (const f of fields) {
		const key = `${f.def.scope}.${f.end ? endKey(f.def.key) : f.def.key}`;
		const header = counts.get(label(f))! > 1 ? `${labels.scope(f.def.scope)}: ${label(f)}` : label(f);
		columns.push({ key, header, def: f.def, end: f.end });
		if (options.units === 'columns' && unitOf(f.def, options.lengths)) columns.push({ key: `${key}.unit`, header: unitHeader(header), def: f.def, end: f.end, unitOf: key });
	}
	return columns;
}

/** The stored value of a column on a row. Take focal length is the one the take was shot at. */
function valueOf(row: FlatTake, column: PlainColumn): unknown {
	const { def, end } = column;
	if (def.scope === 'take' && def.key === 'focalLength') return end ? row.focalLength?.end : row.focalLength?.start;
	return rowValue(row, def.scope, end ? endKey(def.key) : def.key);
}

/** A number cell with its unit: "35 mm", but "12°" with no space, as the vocabulary says. */
function withUnit(text: string, unit: Unit | 'ft' | undefined, labels: PlainLabels): string {
	if (!unit || text === '') return text;
	return unit === 'deg' ? `${text}${labels.unit(unit)}` : `${text} ${labels.unit(unit)}`;
}

function cellText(def: FieldDef, value: unknown, options: PlainOptions): string {
	const { labels, units, lengths } = options;
	if (value == null) return '';
	const inline = units === 'inline';
	switch (def.type) {
		case 'boolean':
			return value ? labels.yes : labels.no;
		case 'enum':
			return def.options?.includes(value as string) ? labels.option(def, value as string) : String(value);
		case 'length':
			return inline ? formatField(def, value, lengths) : lengthNumber((value as Length).m, lengths);
		case 'rational': {
			const text = formatRational(value as Rational);
			return inline ? withUnit(text, def.unit, labels) : text;
		}
		case 'dimensions': {
			const d = value as Dimensions;
			const text = `${trimNumber(d.width)} x ${trimNumber(d.height)}`;
			return inline ? withUnit(text, def.unit, labels) : text;
		}
		case 'number':
		case 'integer': {
			const text = trimNumber(value as number);
			return inline ? withUnit(text, def.unit, labels) : text;
		}
		default:
			return formatField(def, value, lengths);
	}
}

/** The CSV text: header row or rows, then one row per take. */
export function plainCsv(rows: readonly FlatTake[], options: PlainOptions): string {
	const columns = plainColumns(options);
	const head: string[][] = [];
	if (options.header !== 'keys') head.push(columns.map((c) => c.header));
	if (options.header !== 'labels') head.push(columns.map((c) => c.key));
	const body = rows.map((row) =>
		columns.map((c) => {
			const value = valueOf(row, c);
			if (c.unitOf) return value == null ? '' : options.labels.unit(unitOf(c.def, options.lengths)!);
			return cellText(c.def, value, options);
		})
	);
	return csvText([...head, ...body], { bom: options.bom, guardFormulas: options.guardFormulas ?? true });
}
