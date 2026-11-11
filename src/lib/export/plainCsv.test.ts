import { describe, expect, it } from 'vitest';
import { FIELDS } from '$lib/model/catalogue';
import { parseCsv } from '$lib/model/csv';
import { BOM } from './csvWrite';
import { plainColumns, plainCsv, type PlainLabels } from './plainCsv';
import { flatten } from './selection';
import { input, t42A1A, t9 } from './testData';

/** Stand-in for the i18n helpers: the label is the key, so the test sees which field it is. */
const labels: PlainLabels = {
	field: (def, end) => `${def.key}${end ? ', end' : ''}`,
	scope: (scope) => scope.toUpperCase(),
	option: (def, option) => `<${option}>`,
	unit: (unit) => ({ mm: 'mm', m: 'm', deg: '°', Hz: 'fps', K: 'K', px: 'px', ft: 'ft' })[unit] ?? unit,
	yes: 'yes',
	no: 'no'
};

const base = { labels, header: 'labels', units: 'inline', lengths: 'metric' } as const;

function table(text: string) {
	const [head, ...body] = parseCsv(text.replace(BOM, ''));
	return { head, body, cell: (row: number, key: string) => body[row][head.indexOf(key)] };
}

describe('plainColumns', () => {
	it('has a column for every catalogue field and every end value', () => {
		const keys = plainColumns(base).map((c) => c.key);
		for (const def of FIELDS) {
			expect(keys).toContain(`${def.scope}.${def.key}`);
			if ('end' in def && def.end) expect(keys).toContain(`${def.scope}.${def.key}End`);
		}
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('puts the end column right after its start', () => {
		const keys = plainColumns(base).map((c) => c.key);
		expect(keys.indexOf('take.tiltEnd')).toBe(keys.indexOf('take.tilt') + 1);
	});

	it('prefixes the scope only where two labels would clash', () => {
		const headers = plainColumns(base).map((c) => c.header);
		expect(headers).toContain('name');
		expect(headers).toContain('SLATE: notes');
		expect(headers).toContain('CAMERASETUP: cameraId');
		expect(headers).toContain('TAKE: focalLength');
		expect(headers).toContain('LENS: focalLength');
		expect(headers).toContain('sceneNumber');
		expect(new Set(headers).size).toBe(headers.length);
	});

	it('adds a unit column after each field with a unit when units go in columns', () => {
		const cols = plainColumns({ ...base, units: 'columns' });
		const keys = cols.map((c) => c.key);
		expect(keys[keys.indexOf('take.tStop') - 1]).toBe('take.focalLengthEnd.unit');
		expect(keys).toContain('take.lensHeight.unit');
		expect(keys).not.toContain('take.tStop.unit');
	});
});

describe('plainCsv', () => {
	const rows = () => flatten(input());
	const a1 = () => rows().findIndex((r) => r.take.id === t42A1A.id);

	it('writes one row per take with a label header', () => {
		const t = table(plainCsv(rows(), base));
		expect(t.body).toHaveLength(8);
		expect(t.head[0]).toBe('name');
		expect(t.cell(a1(), 'slateUID')).toBe('42A');
	});

	it('writes the model keys as the header, or both header rows', () => {
		expect(parseCsv(plainCsv(rows(), { ...base, header: 'keys' }))[0][0]).toBe('project.name');
		const both = parseCsv(plainCsv(rows(), { ...base, header: 'both' }));
		expect(both[0][0]).toBe('name');
		expect(both[1][0]).toBe('project.name');
		expect(both).toHaveLength(10);
	});

	it('writes values with their units inline', () => {
		const t = table(plainCsv(rows(), base));
		const r = a1();
		expect(t.cell(r, 'TAKE: focalLength')).toBe('32 mm');
		expect(t.cell(r, 'tilt')).toBe('10°');
		expect(t.cell(r, 'tilt, end')).toBe('-5°');
		expect(t.cell(r, 'captureFrameRate')).toBe('23.976 fps');
		expect(t.cell(r, 'whiteBalance')).toBe('5600 K');
		expect(t.cell(r, 'focusDistance')).toBe('3.048 m');
		expect(t.cell(r, 'lensHeight')).toBe('1.2 m');
		expect(t.cell(r, 'activeSensorResolution')).toBe('4608 x 3164 px');
		expect(t.cell(r, 'tStop')).toBe('2.8');
	});

	it('shows a length as typed when typed in the chosen system', () => {
		const t = table(plainCsv(rows(), { ...base, lengths: 'imperial' }));
		expect(t.cell(a1(), 'focusDistance')).toBe(`10'`);
		expect(t.cell(a1(), 'focusDistance, end')).toBe(`6' 4"`);
	});

	it('writes bare numbers and a unit column when asked', () => {
		const t = table(plainCsv(rows(), { ...base, units: 'columns', lengths: 'imperial' }));
		const r = a1();
		expect(t.cell(r, 'TAKE: focalLength')).toBe('32');
		expect(t.cell(r, 'TAKE: focalLength (unit)')).toBe('mm');
		expect(t.cell(r, 'focusDistance')).toBe('10');
		expect(t.cell(r, 'focusDistance (unit)')).toBe('ft');
		expect(t.cell(r, 'focusDistance, end')).toBe('6.2917');
		expect(t.cell(r, 'tilt, end')).toBe('-5');
	});

	it('leaves the unit cell empty when the value is empty', () => {
		const t = table(plainCsv(rows(), { ...base, units: 'columns' }));
		const r = rows().findIndex((x) => x.take.id === t9.id);
		expect(t.cell(r, 'TAKE: focalLength (unit)')).toBe('');
	});

	it('writes enum labels, yes and no, lists and refs', () => {
		const t = table(plainCsv(rows(), base));
		const r = a1();
		expect(t.cell(r, 'scriptTime')).toBe('<magicHour>');
		expect(t.cell(r, 'circleTake')).toBe('yes');
		expect(t.cell(r, 'noGood')).toBe('');
		expect(t.cell(r, 'vfxShots')).toBe('NT_042_010, NT_042_020');
		expect(t.cell(r, 'cameraSetupId')).toBe('csA');
	});

	it('quotes as RFC 4180 and reads back', () => {
		const text = plainCsv(rows(), base);
		expect(text).toContain('"Rain, ""light"""');
		expect(table(text).cell(a1(), 'TAKE: notes')).toBe('Best\nperformance');
	});

	it('guards cells a spreadsheet would run, and not negative numbers', () => {
		const data = rows();
		data[0] = { ...data[0], take: { ...data[0].take, notes: '=HYPERLINK("x")' } };
		const t = table(plainCsv(data, base));
		expect(t.cell(0, 'TAKE: notes')).toBe(`'=HYPERLINK("x")`);
		expect(table(plainCsv(data, { ...base, guardFormulas: false })).cell(0, 'TAKE: notes')).toBe('=HYPERLINK("x")');
		expect(table(plainCsv(rows(), { ...base, units: 'columns' })).cell(a1(), 'tilt, end')).toBe('-5');
	});

	it('starts with a byte order mark on request', () => {
		expect(plainCsv(rows(), { ...base, bom: true }).startsWith(BOM)).toBe(true);
		expect(plainCsv(rows(), base).startsWith(BOM)).toBe(false);
	});
});
