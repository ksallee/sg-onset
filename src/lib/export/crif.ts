// The VES Camera Report Interchange Format, field specification v1.1: one CSV row per camera take.
// Column names, order, types and the required flag follow the spec's field table. Pure: the time
// zone and the export time are passed in.
//
// What the spec says, as applied here:
// - First line: the column names. Strings in quotes, numbers bare; "" for a quote inside.
// - Records end with a carriage return. We write CRLF, which also reads as RFC 4180.
// - A line break inside a value becomes a vertical tab. Multi-selects split by vertical tab.
// - Timestamps YYYY/MM/DD 24HH:MM:SS, local time. Focus and lens height in feet and inches.
// - Take fields start with "Tk ". Extra columns may be added.
// - Camera Letter is a slate field, so a CRIF slate is one slate on one camera. SlatesUUID is
//   derived per slate and camera setup (uuid.ts); Tk TakesUUID is the take's own UUID.

import { formatRational } from '$lib/model/rational';
import type { Length } from '$lib/model/length';
import { crifDate, crifTime, crifTimestamp, feetInches, metresText, signed, trimNumber } from './format';
import { naturalCompare, type FlatTake } from './selection';
import { uuidV5 } from './uuid';

export const CRIF_VERSION = '1.1';

type Column = { name: string; required?: true; numeric?: true };

/** The spec's field table, in its order. Stereo columns are "required for stereo": optional here. */
export const CRIF_COLUMNS: readonly Column[] = [
	{ name: 'Job' },
	{ name: 'CRIF Version', required: true, numeric: true },
	{ name: 'Unique Slate ID', required: true, numeric: true },
	{ name: 'SlatesUUID', required: true },
	{ name: 'Slate', required: true },
	{ name: 'Camera Letter', required: true },
	{ name: 'VFX Shot' },
	{ name: 'Scene Number', required: true },
	{ name: 'Shoot Day', required: true, numeric: true },
	{ name: 'Shoot Timestamp', required: true },
	{ name: 'Shot Description', required: true },
	{ name: 'Unit', required: true },
	{ name: 'Element Type' },
	{ name: 'VFX Work', required: true },
	{ name: 'Notes' },
	{ name: 'Set Media', required: true },
	{ name: 'Set Location', required: true },
	{ name: 'Set Location Position' },
	{ name: 'Script Location', required: true },
	{ name: 'Script Time' },
	{ name: 'Interior Exterior' },
	{ name: 'Wrangler', required: true },
	{ name: 'Stereo Rig Orientation' },
	{ name: 'Stereo Thru Cam Eye' },
	{ name: 'Camera Head', required: true },
	{ name: 'Camera Head Right' },
	{ name: 'Camera Move Description' },
	{ name: 'Camera Body', required: true },
	{ name: 'Camera Body Right' },
	{ name: 'Camera Mount' },
	{ name: 'Characters' },
	{ name: 'Props' },
	{ name: 'Film Stock', required: true },
	{ name: 'ASA', required: true },
	{ name: 'HDRI Filename' },
	{ name: 'White Balance' },
	{ name: 'Creation Date' },
	{ name: 'Modification Date' },
	{ name: 'Tk Take', required: true },
	{ name: 'Tk TakesUUID', required: true },
	{ name: 'Tk Filter' },
	{ name: 'Tk Focal Length', required: true },
	{ name: 'Tk Focal Length End', required: true },
	{ name: 'Tk FPS', required: true },
	{ name: 'Tk Lens Focus', required: true },
	{ name: 'Tk Lens Focus End', required: true },
	{ name: 'Tk Lens Height' },
	{ name: 'Tk Lens Height End' },
	{ name: 'Tk Lens ID' },
	{ name: 'Tk Lens Serial Num', required: true },
	{ name: 'Tk Lens Serial Num Right' },
	{ name: 'Tk Notes' },
	{ name: 'Tk Roll', required: true },
	{ name: 'Tk Shutter Angle', required: true },
	{ name: 'Tk Start Time Of Take' },
	{ name: 'Tk Stereo Convergence' },
	{ name: 'Tk Stereo IA' },
	{ name: 'Tk Stop', required: true },
	{ name: 'Tk Camera Tilt' },
	{ name: 'Tk Camera Tilt End' },
	{ name: 'Tk Camera Dutch' },
	{ name: 'Tk Camera Dutch End' },
	{ name: 'Tk Clip Num' },
	{ name: 'Tk Timecode' },
	{ name: 'Tk Creation Date' },
	{ name: 'Tk Modification Date' }
];

/** Our own columns, after the spec's. Slate-level first, then take-level with the "Tk " prefix. */
export const CRIF_EXTRA_COLUMNS: readonly Column[] = [
	{ name: 'Shoot Date' },
	{ name: 'Setup' },
	{ name: 'Lighting Setup' },
	{ name: 'Camera Model' },
	{ name: 'Camera Serial Num' },
	{ name: 'Tk End Time Of Take' },
	{ name: 'Tk Circled' },
	{ name: 'Tk No Good' },
	{ name: 'Tk Timecode End' },
	{ name: 'Tk Lens Make' },
	{ name: 'Tk Anamorphic Squeeze' },
	{ name: 'Tk Subject Distance' },
	{ name: 'Tk Subject Distance End' },
	{ name: 'Tk Photos' }
];

/** Required columns SG OnSet has no field for. Every row lacks them; the UI can say so once. */
export const CRIF_NEVER_FILLED = ['VFX Work', 'Script Location', 'Camera Head', 'Film Stock'] as const;

/** CRIF's Set Media baseline, in the spec's order, then the values we add. */
const SET_MEDIA_ORDER = ['Balls', 'Clean Plate', 'Cube', 'HDRI', 'Mocap', 'Photos', 'Survey Diagram', 'Tile Set', 'Virtual Set', 'Witness Cam', 'Lidar', 'Colour Chart'];

const SCRIPT_TIME: Record<string, string> = { day: 'Day', night: 'Night', dusk: 'Dusk', dawn: 'Dawn', magicHour: 'Magic Hr' };
const INT_EXT: Record<string, string> = { int: 'Int', ext: 'Ext' };

const VT = '\v';

export type CrifOptions = {
	/** IANA time zone of the shoot: CRIF times are local. */
	timeZone: string;
	/** The export time, ISO 8601: the report's Creation Date. */
	now: string;
	/** Focus, height and subject distance in feet and inches as the spec says, or metres. Default imperial. */
	lengths?: 'imperial' | 'metric';
	/** Add our own columns after the spec's. Default true. */
	extras?: boolean;
	/** Unique Slate ID per `${slate.id}:${cameraSetupId}`. Default: 1, 2, 3 in file order. */
	slateNumbers?: Record<string, number>;
};

/** One CRIF row: its columns in order, and the value of each as text. */
export type CrifRecord = { takeId: string; columns: readonly Column[]; values: Record<string, string> };

/** The key of a CRIF slate: one slate on one camera setup. */
function crifSlateKey(row: FlatTake): string {
	return `${row.slate.id}:${row.take.cameraSetupId ?? ''}`;
}

/** Rows in CRIF order: day and slate as given, then camera, then take, so each CRIF slate is one run. */
function crifOrder(rows: readonly FlatTake[]): FlatTake[] {
	const slateOrder = new Map<string, number>();
	for (const row of rows) if (!slateOrder.has(row.slate.id)) slateOrder.set(row.slate.id, slateOrder.size);
	return [...rows].sort(
		(a, b) =>
			slateOrder.get(a.slate.id)! - slateOrder.get(b.slate.id)! ||
			naturalCompare(a.cameraLetter, b.cameraLetter) ||
			(a.take.cameraSetupId ?? '').localeCompare(b.take.cameraSetupId ?? '') ||
			naturalCompare(a.take.take ?? '', b.take.take ?? '') ||
			a.take.id.localeCompare(b.take.id)
	);
}

/** Text in a CRIF cell: line breaks become vertical tabs. */
function text(value: string | undefined): string {
	return (value ?? '').replace(/\r\n|\r|\n/g, VT);
}

const num = (n: number | undefined) => (n === undefined ? '' : trimNumber(n));
const angle = (n: number | undefined) => (n === undefined ? '' : signed(n));

/**
 * A start and end pair. No end means the value did not change over the take (model README), so
 * the end column repeats the start.
 */
function pair<T>(start: T | undefined, end: T | undefined, show: (v: T) => string): [string, string] {
	if (start === undefined) return ['', end === undefined ? '' : show(end)];
	return [show(start), show(end ?? start)];
}

/** What a slate on one camera shot besides the plates: CRIF Set Media. */
function setMedia(group: readonly FlatTake[]): string {
	const { slate, lightingSetup } = group[0];
	const media = new Set<string>();
	if (lightingSetup?.referenceBalls) media.add('Balls');
	if (slate.cleanPlate) media.add('Clean Plate');
	if (lightingSetup?.hdri) media.add('HDRI');
	if (group.some((r) => r.stills.length > 0)) media.add('Photos');
	if (slate.witnessCamera) media.add('Witness Cam');
	if (slate.lidar) media.add('Lidar');
	if (lightingSetup?.colourChart) media.add('Colour Chart');
	return SET_MEDIA_ORDER.filter((m) => media.has(m)).join(VT);
}

/** CRIF rows for the flat rows, in CRIF order. */
export function crifRecords(rows: readonly FlatTake[], options: CrifOptions): CrifRecord[] {
	const columns = options.extras === false ? CRIF_COLUMNS : [...CRIF_COLUMNS, ...CRIF_EXTRA_COLUMNS];
	const ordered = crifOrder(rows);
	const groups = new Map<string, FlatTake[]>();
	for (const row of ordered) groups.set(crifSlateKey(row), [...(groups.get(crifSlateKey(row)) ?? []), row]);
	const numbers = new Map([...groups.keys()].map((key, i) => [key, options.slateNumbers?.[key] ?? i + 1]));
	const length = (l: Length) => (options.lengths === 'metric' ? metresText(l.m) : feetInches(l.m));
	const tz = options.timeZone;

	return ordered.map((row) => {
		const { project, shootDay, slate, take, lightingSetup, camera, lens } = row;
		const key = crifSlateKey(row);
		const group = groups.get(key)!;
		const firstStart = group.map((r) => r.take.startedAt).filter((s): s is string => !!s).sort()[0];
		const [focal, focalEnd] = row.focalLength ? [trimNumber(row.focalLength.start), trimNumber(row.focalLength.end)] : ['', ''];
		const [focus, focusEnd] = pair(take.focusDistance, take.focusDistanceEnd, length);
		const [height, heightEnd] = pair(take.lensHeight, take.lensHeightEnd, length);
		const [tilt, tiltEnd] = pair(take.tilt, take.tiltEnd, angle);
		const [dutch, dutchEnd] = pair(take.roll, take.rollEnd, angle);
		const [subject, subjectEnd] = pair(take.distanceToSubject, take.distanceToSubjectEnd, length);
		const values: Record<string, string> = {
			Job: text(project.name),
			'CRIF Version': CRIF_VERSION,
			'Unique Slate ID': String(numbers.get(key)),
			SlatesUUID: uuidV5(slate.id, take.cameraSetupId ?? ''),
			Slate: text(slate.slateUID),
			'Camera Letter': text(row.cameraLetter),
			'VFX Shot': text(slate.vfxShots?.join(', ')),
			'Scene Number': text(slate.sceneNumber),
			'Shoot Day': num(shootDay.shootDay),
			'Shoot Timestamp': firstStart ? crifTimestamp(firstStart, tz) : '',
			'Shot Description': text(slate.description),
			Unit: text(shootDay.cameraUnit),
			'Element Type': text(slate.elementType),
			Notes: text(slate.notes),
			'Set Media': setMedia(group),
			'Set Location': text(shootDay.location),
			'Script Time': SCRIPT_TIME[slate.scriptTime ?? ''] ?? '',
			'Interior Exterior': INT_EXT[slate.interiorExterior ?? ''] ?? '',
			Wrangler: text(shootDay.wrangler),
			'Camera Body': text(camera?.cameraMake),
			ASA: num(take.isoSpeed),
			'HDRI Filename': text(lightingSetup?.hdriFilename),
			'White Balance': take.whiteBalance === undefined ? '' : `${trimNumber(take.whiteBalance)}K`,
			'Creation Date': crifTimestamp(options.now, tz),
			'Tk Take': text(take.take),
			'Tk TakesUUID': take.id,
			'Tk Filter': text(take.filter),
			'Tk Focal Length': focal,
			'Tk Focal Length End': focalEnd,
			'Tk FPS': take.captureFrameRate ? formatRational(take.captureFrameRate) : '',
			'Tk Lens Focus': focus,
			'Tk Lens Focus End': focusEnd,
			'Tk Lens Height': height,
			'Tk Lens Height End': heightEnd,
			'Tk Lens ID': text(lens?.lensModel),
			'Tk Lens Serial Num': text(lens?.lensSerialNumber),
			'Tk Notes': text(take.notes),
			'Tk Roll': text(take.cameraRoll),
			'Tk Shutter Angle': num(take.shutterAngle),
			'Tk Start Time Of Take': take.startedAt ? crifTime(take.startedAt, tz) : '',
			'Tk Stop': take.tStop === undefined ? '' : `T${trimNumber(take.tStop)}`,
			'Tk Camera Tilt': tilt,
			'Tk Camera Tilt End': tiltEnd,
			'Tk Camera Dutch': dutch,
			'Tk Camera Dutch End': dutchEnd,
			'Tk Clip Num': text(take.clipName),
			'Tk Timecode': text(take.timecodeStart),
			// Ours.
			'Shoot Date': crifDate(shootDay.shootDate ?? ''),
			Setup: text(slate.setup),
			'Lighting Setup': text(lightingSetup?.label),
			'Camera Model': text(camera?.cameraModel),
			'Camera Serial Num': text(camera?.cameraSerialNumber),
			'Tk End Time Of Take': take.endedAt ? crifTime(take.endedAt, tz) : '',
			'Tk Circled': take.circleTake ? 'Yes' : '',
			'Tk No Good': take.noGood ? 'Yes' : '',
			'Tk Timecode End': text(take.timecodeEnd),
			'Tk Lens Make': text(lens?.lensMake),
			'Tk Anamorphic Squeeze': lens?.anamorphicSqueeze ? formatRational(lens.anamorphicSqueeze) : '',
			'Tk Subject Distance': subject,
			'Tk Subject Distance End': subjectEnd,
			'Tk Photos': row.stills.length ? String(row.stills.length) : ''
		};
		const picked: Record<string, string> = {};
		for (const c of columns) picked[c.name] = values[c.name] ?? '';
		return { takeId: take.id, columns, values: picked };
	});
}

/** A CRIF cell: a number bare, everything else in quotes with quotes doubled. */
function cell(column: Column, value: string): string {
	return column.numeric ? value : `"${value.replace(/"/g, '""')}"`;
}

/** The CSV text. Columns from the first record, the spec's alone when there is none. */
export function crifCsv(records: readonly CrifRecord[], columns: readonly Column[] = records[0]?.columns ?? CRIF_COLUMNS): string {
	const lines = [columns.map((c) => cell({ name: c.name }, c.name)).join(',')];
	for (const r of records) lines.push(columns.map((c) => cell(c, r.values[c.name] ?? '')).join(','));
	return lines.map((l) => `${l}\r\n`).join('');
}

/** The required CRIF columns a row leaves empty, in column order. */
export function crifMissing(record: CrifRecord): string[] {
	return CRIF_COLUMNS.filter((c) => c.required && (record.values[c.name] ?? '') === '').map((c) => c.name);
}

/** The CSV, and per take the required columns it lacks that SG OnSet could have filled. */
export function exportCrif(rows: readonly FlatTake[], options: CrifOptions): { text: string; missing: { takeId: string; columns: string[] }[] } {
	const records = crifRecords(rows, options);
	const never = new Set<string>(CRIF_NEVER_FILLED);
	return {
		text: crifCsv(records, options.extras === false ? CRIF_COLUMNS : [...CRIF_COLUMNS, ...CRIF_EXTRA_COLUMNS]),
		missing: records.map((r) => ({ takeId: r.takeId, columns: crifMissing(r).filter((c) => !never.has(c)) }))
	};
}
