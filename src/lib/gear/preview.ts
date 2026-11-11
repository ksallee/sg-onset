// What a CSV import will do, before anything is saved: each data row with its fate, built from
// the model's import report. Pure: the caller passes the ids and the gear already there.

import { parseCsv } from '$lib/model/csv';
import { importCameras, importLenses, type ImportIssue, type ImportOptions, type ImportReport } from '$lib/model/gearImport';
import type { Camera, Lens } from '$lib/model/types';
import { findDuplicate } from './duplicates';
import type { GearScope } from './names';

/**
 * ready: imports as it is. warning: imports, some values left out. dropped: does not import.
 * duplicate: the same gear as one in the project (`within` false) or on an earlier row of the
 * file (`within` true); imports only if the person says so.
 */
export type RowStatus = 'ready' | 'warning' | 'dropped' | 'duplicate';

export type PreviewRow = {
	/** 1-based row in the file. */
	row: number;
	status: RowStatus;
	record?: Camera | Lens;
	issues: ImportIssue[];
	/** The id of the record this row repeats. */
	duplicateOf?: string;
	within?: boolean;
};

export type ImportPreview = {
	scope: GearScope;
	report: ImportReport;
	rows: PreviewRow[];
	/** What is wrong with the file as a whole (no header). */
	fileIssues: ImportIssue[];
	counts: { rows: number } & Record<RowStatus, number>;
};

export type DuplicateChoice = 'skip' | 'add';

/** The 1-based numbers of the data rows: the non-blank rows under the header, as the model reads them. */
function dataRows(text: string, headerRow: number | null): number[] {
	if (headerRow === null) return [];
	return parseCsv(text)
		.map((cells, i) => ({ row: i + 1, blank: cells.every((c) => c === '') }))
		.filter((r) => r.row > headerRow && !r.blank)
		.map((r) => r.row);
}

export function previewImport(scope: GearScope, text: string, existing: readonly (Camera | Lens)[], options: ImportOptions): ImportPreview {
	const empty = { rows: 0, ready: 0, warning: 0, dropped: 0, duplicate: 0 };
	if (text.trim() === '') {
		return { scope, report: { headerRow: null, columns: {}, ignoredColumns: [], rows: 0, imported: 0, issues: [] }, rows: [], fileIssues: [], counts: empty };
	}
	const { records, report } = scope === 'camera' ? importCameras(text, options) : importLenses(text, options);
	const queue: (Camera | Lens)[] = [...records];
	const earlier: (Camera | Lens)[] = [];
	const rows: PreviewRow[] = dataRows(text, report.headerRow).map((row) => {
		const issues = report.issues.filter((i) => i.row === row);
		if (issues.some((i) => i.severity === 'error')) return { row, status: 'dropped', issues };
		const record = queue.shift()!;
		const mine = findDuplicate(scope, existing, record);
		const again = mine ? undefined : findDuplicate(scope, earlier, record);
		earlier.push(record);
		const twin = mine ?? again;
		if (twin) return { row, status: 'duplicate', record, issues, duplicateOf: twin.id, within: !mine };
		return { row, status: issues.length ? 'warning' : 'ready', record, issues };
	});
	const counts = { ...empty, rows: rows.length };
	for (const r of rows) counts[r.status]++;
	return { scope, report, rows, fileIssues: report.issues.filter((i) => i.row === 0), counts };
}

/** The records to save: every row that imports, and the duplicates only with `add`. */
export function recordsToImport(preview: ImportPreview, duplicates: DuplicateChoice): (Camera | Lens)[] {
	return preview.rows
		.filter((r) => r.record && (r.status !== 'duplicate' || duplicates === 'add'))
		.map((r) => r.record!);
}

/** What the import reads a column as, by catalogue key: parts of a size or a range name their field. */
const FIELD_OF: Record<string, string> = {
	sensor: 'activeSensorPhysicalDimensions',
	sensorWidth: 'activeSensorPhysicalDimensions',
	sensorHeight: 'activeSensorPhysicalDimensions',
	resolution: 'activeSensorResolution',
	resolutionWidth: 'activeSensorResolution',
	resolutionHeight: 'activeSensorResolution',
	focalLengthMin: 'focalLength'
};

/** The columns the import read, in file order, each with the catalogue field it fills. */
export function columnsRead(report: ImportReport): { header: string; key: string }[] {
	return Object.entries(report.columns).map(([header, target]) => ({ header, key: FIELD_OF[target] ?? target }));
}
