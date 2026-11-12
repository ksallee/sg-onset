// The gear library: camera bodies and lenses the app ships with, to pick from instead of typing.
// The tables are CSV (library/cameras.csv, library/camera-modes.csv, library/lenses.csv), each row read from the maker's
// spec sheet, its source beside it. Only what is picked becomes a record of the project. Pure:
// the caller passes the CSV text and the id generator.

import { parseCsv } from '$lib/model/csv';
import { parseRational, type Rational } from '$lib/model/rational';
import type { Camera, Dimensions, Lens } from '$lib/model/types';
import { findDuplicate } from './duplicates';
import { matchesQuery } from './list';
import type { GearScope } from './names';

/** One recording mode of a body: what the camera menu calls it, and the sensor it reads. */
export type LibraryCameraMode = {
	/** The maker's name of the mode. */
	name?: string;
	/** The active area, mm. */
	sensor?: Dimensions;
	/** px */
	resolution?: Dimensions;
	source: string;
};

export type LibraryCamera = {
	make: string;
	model: string;
	/** The recording modes. The first is the full sensor: the body's own row in cameras.csv. */
	modes: LibraryCameraMode[];
};

/** A body in one of its modes: what is picked, and what becomes a camera of the project. */
export type CameraPick = { camera: LibraryCamera; mode: LibraryCameraMode };

export type LibraryLens = {
	make: string;
	series: string;
	model: string;
	/** mm; the short end of a zoom. */
	focalLength: number;
	/** mm; the long end of a zoom. */
	focalLengthMax?: number;
	squeeze?: Rational;
	/** The widest stop. Shown in the library; the project's lens has no such field. */
	tStop?: number;
	/** S35, FF, LF or 65. Shown in the library only. */
	coverage?: string;
	source: string;
};

export type LensSeries = { key: string; make: string; series: string; lenses: LibraryLens[] };

type Line = (column: string) => string;

/** The data rows of a table, each read by column name. */
function lines(csv: string): Line[] {
	const [header, ...rows] = parseCsv(csv);
	if (!header) return [];
	const at = new Map(header.map((name, i) => [name.trim(), i]));
	return rows.filter((cells) => cells.some((c) => c !== '')).map((cells) => (column) => (cells[at.get(column) ?? -1] ?? '').trim());
}

const number = (text: string): number | undefined => (text !== '' && Number.isFinite(Number(text)) && Number(text) > 0 ? Number(text) : undefined);

function size(width: string, height: string): Dimensions | undefined {
	const w = number(width);
	const h = number(height);
	return w !== undefined && h !== undefined ? { width: w, height: h } : undefined;
}

/** Drops the keys with nothing in them. */
function compact<T extends object>(row: T): T {
	return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined && v !== '')) as T;
}

function readMode(cell: Line): LibraryCameraMode {
	return compact({
		name: cell('sensorMode'),
		sensor: size(cell('sensorWidthMm'), cell('sensorHeightMm')),
		resolution: size(cell('resolutionWidthPx'), cell('resolutionHeightPx')),
		source: cell('sourceUrl')
	});
}

const bodyKey = (make: string, model: string) => `${make}|${model}`.toLowerCase();

/**
 * The bodies, each with its modes: the full sensor from `csv`, then the rows of `modesCsv` (same
 * columns) for that make and model, in file order. A mode row of no known body is left out.
 */
export function parseLibraryCameras(csv: string, modesCsv = ''): LibraryCamera[] {
	const cameras: LibraryCamera[] = lines(csv)
		.filter((cell) => cell('cameraModel') !== '')
		.map((cell) => ({ make: cell('cameraMake'), model: cell('cameraModel'), modes: [readMode(cell)] }));
	const byKey = new Map(cameras.map((c) => [bodyKey(c.make, c.model), c]));
	for (const cell of lines(modesCsv)) {
		const camera = byKey.get(bodyKey(cell('cameraMake'), cell('cameraModel')));
		if (camera && cell('sensorMode') !== '') camera.modes.push(readMode(cell));
	}
	return cameras;
}

/** The model a pick is saved under: the body alone for its full sensor, else the body and the mode. */
export function pickModel(pick: CameraPick): string {
	const full = pick.mode === pick.camera.modes[0];
	return full || !pick.mode.name ? pick.camera.model : `${pick.camera.model}, ${pick.mode.name}`;
}

export function parseLibraryLenses(csv: string): LibraryLens[] {
	const out: LibraryLens[] = [];
	for (const cell of lines(csv)) {
		const focalLength = number(cell('focalLength'));
		if (cell('lensModel') === '' || focalLength === undefined) continue;
		const max = number(cell('focalLengthMax'));
		const squeeze = cell('anamorphicSqueeze') === '' ? null : parseRational(cell('anamorphicSqueeze'));
		out.push(
			compact({
				make: cell('lensMake'),
				series: cell('series'),
				model: cell('lensModel'),
				focalLength,
				focalLengthMax: max !== undefined && max !== focalLength ? max : undefined,
				squeeze: squeeze && squeeze.num !== squeeze.denom ? squeeze : undefined,
				tStop: number(cell('maxTStop')),
				coverage: cell('coverage'),
				source: cell('sourceUrl')
			})
		);
	}
	return out;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** The lenses as sets: by make, then series; in a set, primes by focal length, then zooms. */
export function lensSeries(lenses: readonly LibraryLens[]): LensSeries[] {
	const sets = new Map<string, LensSeries>();
	for (const lens of lenses) {
		const key = `${lens.make}|${lens.series}`;
		let set = sets.get(key);
		if (!set) sets.set(key, (set = { key, make: lens.make, series: lens.series, lenses: [] }));
		set.lenses.push(lens);
	}
	const zoom = (l: LibraryLens) => (l.focalLengthMax === undefined ? 0 : 1);
	for (const set of sets.values()) set.lenses.sort((a, b) => zoom(a) - zoom(b) || a.focalLength - b.focalLength || (a.focalLengthMax ?? 0) - (b.focalLengthMax ?? 0));
	return [...sets.values()].sort((a, b) => collator.compare(a.make, b.make) || collator.compare(a.series, b.series));
}

/** The bodies found by make or model. Their modes are searched once a body is open (`searchModes`). */
export function searchLibraryCameras(cameras: readonly LibraryCamera[], query: string): LibraryCamera[] {
	return cameras.filter((c) => matchesQuery([c.make, c.model], query));
}

/** The modes of a body found by name: "6k 16:9". The full sensor answers to its own name only. */
export function searchModes(camera: LibraryCamera, query: string): LibraryCameraMode[] {
	return camera.modes.filter((m) => matchesQuery([m.name], query));
}

const focalWords = (l: LibraryLens) => [l.focalLength, l.focalLengthMax].filter((n) => n !== undefined).flatMap((n) => [String(n), `${n}mm`]);

/** The sets found by make or name, or by a focal length they hold. */
export function searchSeries(series: readonly LensSeries[], query: string): LensSeries[] {
	return series.filter((s) => matchesQuery([s.make, s.series, ...s.lenses.flatMap((l) => [l.model, ...focalWords(l)])], query));
}

export function cameraRecord(pick: CameraPick, id: string, projectId: string): Camera {
	return compact({
		id,
		projectId,
		cameraMake: pick.camera.make,
		cameraModel: pickModel(pick),
		activeSensorPhysicalDimensions: pick.mode.sensor,
		activeSensorResolution: pick.mode.resolution
	});
}

export function lensRecord(entry: LibraryLens, id: string, projectId: string): Lens {
	return compact({
		id,
		projectId,
		lensMake: entry.make,
		lensModel: entry.model,
		focalLength: entry.focalLength,
		focalLengthMax: entry.focalLengthMax,
		anamorphicSqueeze: entry.squeeze
	});
}

type Entry<S extends GearScope> = S extends 'camera' ? CameraPick : LibraryLens;
type Stored<S extends GearScope> = S extends 'camera' ? Camera : Lens;

function record<S extends GearScope>(scope: S, entry: Entry<S>, id: string, projectId: string): Stored<S> {
	return (scope === 'camera' ? cameraRecord(entry as CameraPick, id, projectId) : lensRecord(entry as LibraryLens, id, projectId)) as Stored<S>;
}

/** The project already lists this model with no serial number (gear/duplicates.ts). */
export function inProject<S extends GearScope>(scope: S, entry: Entry<S>, existing: readonly Stored<S>[]): boolean {
	return findDuplicate(scope, existing, record(scope, entry, '', '')) !== undefined;
}

/**
 * The records the picks become. A pick the project already has, or one picked twice, is left
 * out and counted in `already`.
 */
export function libraryAdds<S extends GearScope>(scope: S, picks: readonly Entry<S>[], existing: readonly Stored<S>[], projectId: string, newId: () => string): { records: Stored<S>[]; already: number } {
	const records: Stored<S>[] = [];
	let already = 0;
	for (const pick of picks) {
		const candidate = record(scope, pick, '', projectId);
		if (findDuplicate(scope, [...existing, ...records], candidate)) already++;
		else records.push({ ...candidate, id: newId() });
	}
	return { records, already };
}
