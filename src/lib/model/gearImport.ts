// Gear lists from CSV: camera bodies and lenses. Finds the header row, knows a column by many
// names, tells a prime from a zoom by its focal range, and reports what it could not read row by
// row. Nothing is thrown, whatever the file. Pure: the caller passes the id generator.

import { findField } from './catalogue';
import { parseCsv } from './csv';
import { parseField } from './fieldText';
import type { Camera, FieldValue, Lens } from './types';

/**
 * One thing the import could not read. `row` is the 1-based row in the file, 0 for the file as a
 * whole. An error drops the row; a warning drops only the value. Keys: import.noHeader,
 * import.missingModel, import.badValue, import.incompleteSize, import.noFocalLength, import.focalConflict.
 */
export type ImportIssue = { row: number; column?: string; key: string; value?: string; severity: 'error' | 'warning' };

export type ImportReport = {
	/** The 1-based row the header was found on, or null when there is none. */
	headerRow: number | null;
	/** Header text → what the column was read as. */
	columns: Record<string, string>;
	/** Headers of the columns that were not used. */
	ignoredColumns: string[];
	/** Data rows that were not blank. */
	rows: number;
	/** Rows that became records. */
	imported: number;
	issues: ImportIssue[];
};

export type ImportOptions = { projectId: string; newId: () => string };

/** Column names, squashed to lowercase letters and digits, and what each one means. */
const CAMERA_COLUMNS: Record<string, string> = {
	...names('cameraMake', 'make', 'manufacturer', 'brand', 'cameramake', 'cameramanufacturer'),
	...names('cameraModel', 'model', 'camera', 'cameramodel', 'body', 'camerabody', 'name', 'cameraname'),
	...names('cameraSerialNumber', 'serial', 'serialnumber', 'serialno', 'serialnum', 'sn', 'cameraserial', 'cameraserialnumber', 'camerasn'),
	...names('sensor', 'sensor', 'sensorsize', 'sensordimensions', 'activesensorphysicaldimensions'),
	...names('sensorWidth', 'sensorwidth', 'sensorw'),
	...names('sensorHeight', 'sensorheight', 'sensorh'),
	...names('resolution', 'resolution', 'res', 'activesensorresolution', 'framesize'),
	...names('resolutionWidth', 'resolutionwidth', 'reswidth', 'framewidth', 'widthpx'),
	...names('resolutionHeight', 'resolutionheight', 'resheight', 'frameheight', 'heightpx')
};

const LENS_COLUMNS: Record<string, string> = {
	...names('lensMake', 'make', 'manufacturer', 'brand', 'lensmake', 'lensmanufacturer'),
	...names('lensModel', 'model', 'lens', 'lensmodel', 'name', 'lensname', 'series', 'lenstype', 'lensid'),
	...names('lensSerialNumber', 'serial', 'serialnumber', 'serialno', 'serialnum', 'sn', 'lensserial', 'lensserialnumber', 'lensserialnum', 'lenssn'),
	...names('focalLength', 'focallength', 'focal', 'fl', 'mm', 'focalrange', 'nominalfocallength'),
	...names('focalLengthMin', 'focalmin', 'minfocal', 'focallengthmin', 'minfocallength', 'focalstart', 'wide'),
	...names('focalLengthMax', 'focalmax', 'maxfocal', 'focallengthmax', 'maxfocallength', 'focalend', 'tele', 'longend', 'focallengthlongend'),
	...names('anamorphicSqueeze', 'squeeze', 'anamorphicsqueeze', 'anamorphic', 'squeezefactor')
};

function names(target: string, ...aliases: string[]): Record<string, string> {
	return Object.fromEntries(aliases.map((alias) => [alias, target]));
}

/** How many rows down the header may sit, under title lines. */
const HEADER_SEARCH_ROWS = 20;

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const FOCAL = new RegExp(String.raw`^(${NUM})\s*(?:mm)?\s*(?:(?:-|–|—|to)\s*(${NUM})\s*(?:mm)?)?$`, 'i');
const toNumber = (text: string) => Number(text.replace(',', '.'));

/** What a header means: its squashed name, or that name without a unit on the end. */
function columnTarget(header: string, known: Record<string, string>): string | undefined {
	const squashed = header.toLowerCase().replace(/[^a-z0-9]/g, '');
	const own = (name: string) => (Object.hasOwn(known, name) ? known[name] : undefined);
	return own(squashed) ?? own(squashed.replace(/(mm|px)$/, ''));
}

type Cell = { text: string; column: string };
type Row = { row: number; cell: (target: string) => Cell | undefined };
type Sheet = { report: ImportReport; rows: Row[] };

/**
 * Finds the header and maps its columns. The header is the first row with a column for
 * `required`. With no such row the report says so and there are no rows.
 */
function readSheet(text: string, known: Record<string, string>, required: string): Sheet {
	const table = parseCsv(text);
	const report: ImportReport = { headerRow: null, columns: {}, ignoredColumns: [], rows: 0, imported: 0, issues: [] };
	const at = table.slice(0, HEADER_SEARCH_ROWS).findIndex((cells) => cells.some((header) => columnTarget(header, known) === required));
	if (at < 0) {
		report.issues.push({ row: 0, key: 'import.noHeader', severity: 'error' });
		return { report, rows: [] };
	}
	report.headerRow = at + 1;
	const columns = new Map<string, { index: number; header: string }>();
	table[at].forEach((header, index) => {
		const target = columnTarget(header, known);
		if (target && !columns.has(target)) {
			columns.set(target, { index, header });
			report.columns[header] = target;
		} else if (header !== '') {
			report.ignoredColumns.push(header);
		}
	});
	const rows: Row[] = [];
	table.slice(at + 1).forEach((cells, i) => {
		if (cells.every((c) => c === '')) return;
		rows.push({
			row: at + 2 + i,
			cell: (target) => {
				const column = columns.get(target);
				const cellText = column ? (cells[column.index] ?? '') : '';
				return column && cellText !== '' ? { text: cellText, column: column.header } : undefined;
			}
		});
	});
	report.rows = rows.length;
	return { report, rows };
}

/** Text cells copied to fields as they are. */
function copyText(row: Row, record: Record<string, unknown>, keys: string[]): void {
	for (const key of keys) {
		const cell = row.cell(key);
		if (cell) record[key] = cell.text;
	}
}

const bad = (row: Row, cell: Cell): ImportIssue => ({ row: row.row, column: cell.column, key: 'import.badValue', value: cell.text, severity: 'warning' });

/** The model, or the error that drops the row. */
function requireModel(sheet: Sheet, row: Row, key: string): boolean {
	if (row.cell(key)) return true;
	const column = Object.keys(sheet.report.columns).find((header) => sheet.report.columns[header] === key);
	sheet.report.issues.push({ row: row.row, column, key: 'import.missingModel', severity: 'error' });
	return false;
}

/**
 * A width × height value from one cell ("4608x3164"), or from a width cell and a height cell.
 * Read and checked as the catalogue field `key`.
 */
function readSize(sheet: Sheet, row: Row, key: 'activeSensorPhysicalDimensions' | 'activeSensorResolution', both: string, width: string, height: string): FieldValue | undefined {
	const def = findField('camera', key)!.def;
	const whole = row.cell(both);
	const w = row.cell(width);
	const h = row.cell(height);
	if (!whole && !w && !h) return undefined;
	if (!whole && (!w || !h)) {
		const lone = (w ?? h)!;
		sheet.report.issues.push({ row: row.row, column: lone.column, key: 'import.incompleteSize', value: lone.text, severity: 'warning' });
		return undefined;
	}
	const parsed = parseField(def, whole ? whole.text : `${w!.text} x ${h!.text}`, 'metric');
	if (parsed.ok) return parsed.value;
	for (const cell of whole ? [whole] : [w!, h!]) sheet.report.issues.push(bad(row, cell));
	return undefined;
}

/**
 * Camera bodies from CSV text. Columns: make, model (required), serial, sensor size in mm and
 * resolution in px, each as one "W x H" cell or as width and height columns.
 */
export function importCameras(text: string, options: ImportOptions): { records: Camera[]; report: ImportReport } {
	const sheet = readSheet(text, CAMERA_COLUMNS, 'cameraModel');
	const records: Camera[] = [];
	for (const row of sheet.rows) {
		if (!requireModel(sheet, row, 'cameraModel')) continue;
		const record: Record<string, unknown> = { id: options.newId(), projectId: options.projectId };
		copyText(row, record, ['cameraMake', 'cameraModel', 'cameraSerialNumber']);
		const sensor = readSize(sheet, row, 'activeSensorPhysicalDimensions', 'sensor', 'sensorWidth', 'sensorHeight');
		if (sensor !== undefined) record.activeSensorPhysicalDimensions = sensor;
		const resolution = readSize(sheet, row, 'activeSensorResolution', 'resolution', 'resolutionWidth', 'resolutionHeight');
		if (resolution !== undefined) record.activeSensorResolution = resolution;
		records.push(record as Camera);
	}
	sheet.report.imported = records.length;
	return { records, report: sheet.report };
}

/** The focal lengths a cell gives, or undefined (and a warning) when it cannot be read. */
function readFocalCell(sheet: Sheet, row: Row, cell: Cell): number[] | undefined {
	const m = FOCAL.exec(cell.text);
	const values = m ? [m[1], m[2]].filter((v) => v !== undefined).map(toNumber) : [];
	if (values.length > 0 && values.every((v) => v > 0)) return values;
	sheet.report.issues.push(bad(row, cell));
	return undefined;
}

/**
 * The focal lengths a row gives, low to high: one for a prime, two for a zoom, none when unread.
 * The focal length column (or the min column without it) and the long end column are read
 * together. A range in the focal length column wins over a long end that disagrees with it: the
 * long end is left out, with a warning.
 */
function readFocal(sheet: Sheet, row: Row): number[] {
	const first = row.cell('focalLength') ?? row.cell('focalLengthMin');
	const longEnd = row.cell('focalLengthMax');
	if (!first && !longEnd) {
		sheet.report.issues.push({ row: row.row, key: 'import.noFocalLength', severity: 'warning' });
		return [];
	}
	const a = (first && readFocalCell(sheet, row, first)) || [];
	const b = (longEnd && readFocalCell(sheet, row, longEnd)) || [];
	if (a.length > 1 && b.length > 0) {
		if (Math.max(...b) !== Math.max(...a)) sheet.report.issues.push({ row: row.row, column: longEnd!.column, key: 'import.focalConflict', value: longEnd!.text, severity: 'warning' });
		return a.sort((x, y) => x - y);
	}
	return [...a, ...b].sort((x, y) => x - y);
}

/**
 * Lenses from CSV text. Columns: make, model (required), serial, squeeze, and the focal length
 * in one column ("32", "24-290mm"), in a min and a max column, or in a focal length and a long
 * end column, as the catalogue names them. One focal length, or a range whose ends are equal, is
 * a prime; a range is a zoom.
 */
export function importLenses(text: string, options: ImportOptions): { records: Lens[]; report: ImportReport } {
	const sheet = readSheet(text, LENS_COLUMNS, 'lensModel');
	const squeezeDef = findField('lens', 'anamorphicSqueeze')!.def;
	const records: Lens[] = [];
	for (const row of sheet.rows) {
		if (!requireModel(sheet, row, 'lensModel')) continue;
		const record: Record<string, unknown> = { id: options.newId(), projectId: options.projectId };
		copyText(row, record, ['lensMake', 'lensModel', 'lensSerialNumber']);
		const focal = readFocal(sheet, row);
		if (focal.length > 0) record.focalLength = focal[0];
		if (focal.length > 1 && focal[focal.length - 1] !== focal[0]) record.focalLengthMax = focal[focal.length - 1];
		const squeeze = row.cell('anamorphicSqueeze');
		if (squeeze) {
			const parsed = parseField(squeezeDef, /^spherical$/i.test(squeeze.text) ? '1' : squeeze.text, 'metric');
			if (parsed.ok) record.anamorphicSqueeze = parsed.value;
			else sheet.report.issues.push(bad(row, squeeze));
		}
		records.push(record as Lens);
	}
	sheet.report.imported = records.length;
	return { records, report: sheet.report };
}
