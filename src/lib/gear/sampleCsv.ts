// A sample CSV for each kind of gear, so a person sees the shape the import reads. The header is
// the catalogue's keys, which the import knows; the rows are made-up gear written as the import
// reads it back. A zoom's range sits in the focal length column ("24-290"): the import reads a
// long end column only when there is no focal length column. Pure: the page turns the text into
// a file.

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
	{ lensMake: 'Cooke', lensModel: 'S4/i 50 mm', lensSerialNumber: 'C50-0001', focalLength: 50 },
	{ lensMake: 'Angénieux', lensModel: 'Optimo 24-290', lensSerialNumber: 'OPT-0001', focalLength: 24, focalLengthMax: 290 },
	{ lensMake: 'Hawk', lensModel: 'V-Lite 40 mm', lensSerialNumber: 'HWK-0001', focalLength: 40, anamorphicSqueeze: rational(2, 1) }
];

/** The columns of a sample: the catalogue's keys of the scope, the long end folded into the focal length. */
export function sampleColumns(scope: GearScope): FieldDef[] {
	return fieldsOf(scope).filter((d) => d.key !== 'focalLengthMax');
}

function cell(def: FieldDef, example: Example): string {
	if (def.key === 'focalLength' && example.focalLengthMax !== undefined) return `${example.focalLength}-${example.focalLengthMax}`;
	return formatField(def, example[def.key], 'metric');
}

export function sampleCsv(scope: GearScope): string {
	const defs = sampleColumns(scope);
	const examples: Example[] = scope === 'camera' ? CAMERAS : LENSES;
	return toCsv([defs.map((d) => d.key), ...examples.map((e) => defs.map((d) => cell(d, e)))]);
}

export function sampleFileName(scope: GearScope): string {
	return `sg-onset-${scope === 'camera' ? 'cameras' : 'lenses'}-sample.csv`;
}
