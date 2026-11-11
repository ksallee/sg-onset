// The model names its strings by key. Every key it can return has a string here: a new catalogue
// field, validation issue or import issue fails this until its string is written.
import { describe, expect, it } from 'vitest';
import { FIELDS, SCOPES, type FieldDef } from '$lib/model/catalogue';
import { TABLES } from '$lib/store/tables';
import fieldTextSource from '$lib/model/fieldText.ts?raw';
import gearImportSource from '$lib/model/gearImport.ts?raw';
import validateSource from '$lib/model/validate.ts?raw';
import { hasMessage } from './messages';
import { fieldLabel, importIssueText, issueText, optionLabel, unitLabel } from './modelText';

const missing = (keys: Iterable<string>) => [...new Set(keys)].filter((key) => !hasMessage(key));
const defs = FIELDS as readonly FieldDef[];
/** The keys a model source file names, as string literals. */
const keysIn = (source: string, prefix: string) => [...source.matchAll(new RegExp(`'(${prefix}\\.[A-Za-z]+)'`, 'g'))].map((m) => m[1]);

// From src/lib/model/README.md.
const VALIDATION = ['required', 'type', 'integer', 'above', 'min', 'max', 'infinity', 'unit', 'rational', 'option', 'date', 'timestamp', 'timecode', 'endBeforeStart', 'focalRange'];
const IMPORT = ['noHeader', 'missingModel', 'badValue', 'incompleteSize', 'noFocalLength'];

describe('field labels', () => {
	it('has a label for every catalogue field', () => {
		expect(missing(defs.map((d) => d.labelKey))).toEqual([]);
	});
	it('has a label for every option of every enum', () => {
		expect(missing(defs.flatMap((d) => (d.options ?? []).map((o) => `${d.labelKey}.${o}`)))).toEqual([]);
	});
	it('has a name for every scope and table, and every unit', () => {
		expect(missing([...SCOPES, ...TABLES].map((s) => `scope.${s}`))).toEqual([]);
		expect(missing(defs.flatMap((d) => (d.unit ? [`unit.${d.unit}`] : [])))).toEqual([]);
	});
	it('reads them', () => {
		const tilt = defs.find((d) => d.scope === 'take' && d.key === 'tilt')!;
		expect(fieldLabel(tilt)).toBe('Tilt');
		expect(fieldLabel(tilt, true)).toBe('Tilt, end');
		expect(optionLabel(defs.find((d) => d.key === 'scriptTime')!, 'magicHour')).toBe('Magic hour');
		expect(unitLabel('deg')).toBe('°');
		expect(unitLabel(undefined)).toBe('');
	});
});

describe('validation messages', () => {
	it('has a string for every key the README lists', () => {
		expect(missing(VALIDATION.map((k) => `validation.${k}`))).toEqual([]);
	});
	it('has a string for every key the model returns', () => {
		const keys = [...keysIn(validateSource, 'validation'), ...keysIn(fieldTextSource, 'validation')];
		expect(keys.length).toBeGreaterThan(10);
		expect(missing(keys)).toEqual([]);
	});
	it('has a word for every value type', () => {
		expect(missing(defs.map((d) => `validation.typeName.${d.type}`))).toEqual([]);
	});
	it('fills the bound, the unit and the type', () => {
		expect(issueText({ key: 'validation.above', params: { above: 0, unit: 'mm' } })).toBe('Must be more than 0 mm.');
		expect(issueText({ key: 'validation.max', params: { max: 90, unit: 'deg' } })).toBe('Must be 90° or less.');
		expect(issueText({ key: 'validation.min', params: { min: 1 } })).toBe('Must be 1 or more.');
		expect(issueText({ key: 'validation.type', params: { type: 'integer' } })).toBe('That is not a whole number.');
		expect(issueText({ key: 'validation.required' })).toBe('This is needed.');
	});
	it('leaves no brace unfilled for any key', () => {
		const params = { above: 0, min: 1, max: 2, unit: 'mm', type: 'number', options: 'int, ext' };
		for (const key of VALIDATION) expect(issueText({ key: `validation.${key}`, params })).not.toMatch(/[{}]/);
	});
});

describe('import messages', () => {
	it('has a string for every key the README lists and the model returns', () => {
		const keys = keysIn(gearImportSource, 'import');
		expect(keys.length).toBeGreaterThanOrEqual(IMPORT.length);
		expect(missing([...IMPORT.map((k) => `import.${k}`), ...keys])).toEqual([]);
	});
	it('fills the row, the column and the value', () => {
		expect(importIssueText({ key: 'import.badValue', row: 4, column: 'Focal', value: 'wide' })).toBe('Row 4, Focal: “wide” could not be read. The value was left out.');
		for (const key of IMPORT) expect(importIssueText({ key: `import.${key}`, row: 2, column: 'Width', value: '36' })).not.toMatch(/[{}]/);
	});
});
