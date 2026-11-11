// The JSON export: the selection as the records themselves, lossless, versioned, keys in a stable
// order. Field keys are the model's, which follow OMC and OpenTrackIO. `readExportJson` reads it
// back into records. Pure: the export time is passed in. The format is in docs/export.md.

import { endKey, fieldsOf, type Scope } from '$lib/model/catalogue';
import type { Camera, CameraSetup, Lens, LightingSetup, Project, ShootDay, Slate, Still, Take } from '$lib/model/types';
import { flatten, naturalCompare, selectShootDays, selectSlates, type ExportFilters, type ExportInput } from './selection';

export const EXPORT_FORMAT = 'sg-onset-export';
/** Goes up when a reader of the old version would misread the new one. */
export const EXPORT_FORMAT_VERSION = 1;

export type ExportData = {
	format: typeof EXPORT_FORMAT;
	formatVersion: number;
	exportedAt: string;
	filters: ExportFilters;
	project: Project;
	shootDays: ShootDay[];
	lightingSetups: LightingSetup[];
	cameraSetups: CameraSetup[];
	cameras: Camera[];
	lenses: Lens[];
	slates: Slate[];
	takes: Take[];
	stills: Still[];
};

/** The record lists, in the order they are written. */
const LISTS = ['shootDays', 'lightingSetups', 'cameraSetups', 'cameras', 'lenses', 'slates', 'takes', 'stills'] as const;
const LIST_SCOPE: Record<(typeof LISTS)[number], Scope | 'still'> = {
	shootDays: 'shootDay',
	lightingSetups: 'lightingSetup',
	cameraSetups: 'cameraSetup',
	cameras: 'camera',
	lenses: 'lens',
	slates: 'slate',
	takes: 'take',
	stills: 'still'
};

/** Keys before the catalogue's: the id, the parent and template links. */
const HEAD_KEYS = ['id', 'projectId', 'shootDayId', 'slateId', 'takeId', 'templateId'];
const STILL_KEYS = ['capturedAt', 'caption'];
/** Inside values: a length's metres before its typed text, a fraction's top before its bottom. */
const NESTED_KEYS = ['m', 'entered', 'text', 'system', 'num', 'denom', 'width', 'height'];

function keyOrder(scope: Scope | 'still'): string[] {
	const fields = scope === 'still' ? STILL_KEYS : fieldsOf(scope).flatMap((d) => (d.end ? [d.key, endKey(d.key)] : [d.key]));
	return [...HEAD_KEYS, ...fields];
}

/** A copy with keys in `order` first, the rest alphabetical; nested objects likewise. */
function ordered(value: unknown, order: readonly string[] = NESTED_KEYS): unknown {
	if (Array.isArray(value)) return value.map((v) => ordered(v));
	if (value === null || typeof value !== 'object') return value;
	const obj = value as Record<string, unknown>;
	const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
	const keys = Object.keys(obj)
		.filter((k) => obj[k] !== undefined)
		.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
	return Object.fromEntries(keys.map((k) => [k, ordered(obj[k])]));
}

const sortById = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => naturalCompare(a.id, b.id) || a.id.localeCompare(b.id));

/**
 * The selection as data. Slates: every slate of the picked days in the slate range, with or
 * without takes. Takes: those the filters keep. Gear and lighting setups: those the kept slates and
 * takes point at. Photos: those of the kept takes.
 */
export function toExportData(input: ExportInput, options: { now: string; filters?: ExportFilters }): ExportData {
	const filters = options.filters ?? {};
	const rows = flatten(input, filters);
	const slates = selectSlates(input, filters);
	const takes = rows.map((r) => r.take);
	const setupIds = new Set(takes.map((t) => t.cameraSetupId));
	const cameraSetups = sortById(input.cameraSetups.filter((s) => setupIds.has(s.id)));
	const cameraIds = new Set([...takes.map((t) => t.cameraId), ...cameraSetups.map((s) => s.cameraId)]);
	const lensIds = new Set([...takes.map((t) => t.lensId), ...cameraSetups.map((s) => s.lensId)]);
	const lightingIds = new Set(slates.map((s) => s.lightingSetupId));
	const dayIds = new Set(slates.map((s) => s.shootDayId));
	const data = {
		format: EXPORT_FORMAT,
		formatVersion: EXPORT_FORMAT_VERSION,
		exportedAt: options.now,
		filters,
		project: input.project,
		shootDays: selectShootDays(input, filters).filter((d) => dayIds.has(d.id)),
		lightingSetups: sortById(input.lightingSetups.filter((l) => lightingIds.has(l.id))),
		cameraSetups,
		cameras: sortById(input.cameras.filter((c) => cameraIds.has(c.id))),
		lenses: sortById(input.lenses.filter((l) => lensIds.has(l.id))),
		slates,
		takes,
		stills: rows.flatMap((r) => r.stills)
	};
	return canonical(data) as ExportData;
}

/** Every record with its keys in the stable order. */
function canonical(data: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {
		format: data.format,
		formatVersion: data.formatVersion,
		exportedAt: data.exportedAt,
		filters: ordered(data.filters, ['shootDayIds', 'slateFrom', 'slateTo', 'circledOnly', 'excludeNoGood']),
		project: ordered(data.project, keyOrder('project'))
	};
	for (const list of LISTS) out[list] = (data[list] as unknown[]).map((r) => ordered(r, keyOrder(LIST_SCOPE[list])));
	return out;
}

/** The JSON text, tab-indented. The same selection gives the same text. */
export function exportJson(input: ExportInput, options: { now: string; filters?: ExportFilters }): string {
	return JSON.stringify(toExportData(input, options), null, '\t') + '\n';
}

export type ReadResult = { ok: true; data: ExportData } | { ok: false; reason: 'notJson' | 'notExport' | 'newerVersion' | 'badShape' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isRecord = (v: unknown) => isObject(v) && typeof v.id === 'string';

/** Reads an export back into records. Checks the format, the version and the shape, not each value. */
export function readExportJson(text: string): ReadResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, reason: 'notJson' };
	}
	if (!isObject(parsed) || parsed.format !== EXPORT_FORMAT) return { ok: false, reason: 'notExport' };
	if (typeof parsed.formatVersion !== 'number' || parsed.formatVersion > EXPORT_FORMAT_VERSION) return { ok: false, reason: 'newerVersion' };
	if (typeof parsed.exportedAt !== 'string' || !isObject(parsed.filters) || !isRecord(parsed.project)) return { ok: false, reason: 'badShape' };
	for (const list of LISTS) {
		const rows = parsed[list];
		if (!Array.isArray(rows) || !rows.every(isRecord)) return { ok: false, reason: 'badShape' };
	}
	return { ok: true, data: canonical(parsed) as ExportData };
}
