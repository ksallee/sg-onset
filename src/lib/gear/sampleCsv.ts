// A sample CSV for each kind of gear, so a person sees the shape the import reads. The header is
// the catalogue's keys, which the import knows; the rows are made-up gear written as the import
// reads it back. A zoom has its short end under focalLength and its long end under
// focalLengthMax. The paste box shows the same text cut to its first rows, so the two never
// part. Pure: the page turns the text into a file.

import { fieldsOf, type FieldDef } from '$lib/model/catalogue';
import { formatField } from '$lib/model/fieldText';
import { rational } from '$lib/model/rational';
import type { Camera, Lens } from '$lib/model/types';
import type { GearScope } from './names';

/** One cell, quoted when it holds a delimiter, a quote, a line end or spaces at either end. */
export function csvCell(text: string): string {
	return /[",;\t\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
	return rows.map((cells) => cells.map(csvCell).join(',')).join('\n') + '\n';
}

type Example = Record<string, unknown>;

const CAMERAS: Omit<Camera, 'id' | 'projectId'>[] = [
	{ cameraMake: 'ARRI', cameraModel: 'Alexa 35', cameraSerialNumber: 'A35-0001', activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 }, activeSensorResolution: { width: 4608, height: 3164 } },
	{ cameraMake: 'Sony', cameraModel: 'Venice 2', cameraSerialNumber: 'V2-0001', activeSensorPhysicalDimensions: { width: 35.9, height: 24 }, activeSensorResolution: { width: 8640, height: 5760 } }
];

const LENSES: Omit<Lens, 'id' | 'projectId'>[] = [
	{ lensMake: 'Cooke', lensModel: 'S4/i 32 mm', lensSerialNumber: 'C32-0001', focalLength: 32 },
	{ lensMake: 'Angénieux', lensModel: 'Optimo 24-290', lensSerialNumber: 'OPT-0001', focalLength: 24, focalLengthMax: 290 },
	{ lensMake: 'Cooke', lensModel: 'S4/i 50 mm', lensSerialNumber: 'C50-0001', focalLength: 50 },
	{ lensMake: 'Hawk', lensModel: 'V-Lite 40 mm', lensSerialNumber: 'HWK-0001', focalLength: 40, anamorphicSqueeze: rational(2, 1) }
];

/** The columns of a sample: the catalogue's keys of the scope. */
export function sampleColumns(scope: GearScope): FieldDef[] {
	return fieldsOf(scope);
}

function sampleRows(scope: GearScope): string[][] {
	const defs = sampleColumns(scope);
	const examples: Example[] = scope === 'camera' ? CAMERAS : LENSES;
	return [defs.map((d) => d.key), ...examples.map((e) => defs.map((d) => formatField(d, e[d.key], 'metric')))];
}

export function sampleCsv(scope: GearScope): string {
	return toCsv(sampleRows(scope));
}

/** How many example rows the paste box shows under the header. */
const PLACEHOLDER_ROWS = 2;

/** The paste box's placeholder: the sample's header and its first rows. */
export function samplePlaceholder(scope: GearScope): string {
	return toCsv(sampleRows(scope).slice(0, 1 + PLACEHOLDER_ROWS)).trimEnd();
}

export function sampleFileName(scope: GearScope): string {
	return `sg-onset-${scope === 'camera' ? 'cameras' : 'lenses'}-sample.csv`;
}
