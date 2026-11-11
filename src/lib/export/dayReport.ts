// The data of a printable camera report for one shoot day: a header, a block per slate with its
// camera setups and takes, totals, and what is missing. No rendering: a UI turns it into HTML or
// PDF. Pure.

import { isZoom } from '$lib/model/take';
import type { Camera, Lens, LightingSetup, Slate } from '$lib/model/types';
import { flatten, selectSlates, type ExportFilters, type ExportInput, type FlatTake } from './selection';

export type DayReportHeader = {
	project?: string;
	shootDate?: string;
	shootDay?: number;
	unit?: string;
	location?: string;
	wrangler?: string;
};

/** A camera setup as a slate used it: the body and the lenses its takes ran, in take order. */
export type DayReportSetup = { cameraSetupId: string; cameraLetter: string; camera?: Camera; lenses: Lens[] };

export type DayReportTotals = { takes: number; circled: number; noGood: number; photos: number };

export type DayReportSlate = {
	slate: Slate;
	lightingSetup?: LightingSetup;
	setups: DayReportSetup[];
	/** The takes, in the flat order: take number, then camera letter. */
	takes: FlatTake[];
	totals: DayReportTotals;
};

/**
 * - `noEndTime`: the take has no end time.
 * - `noFocalLength`: no focal length is known: no prime lens and none typed.
 * - `zoomNoFocalLength`: the take ran a zoom and no focal length was typed.
 */
export type DayReportWarning = {
	kind: 'noEndTime' | 'noFocalLength' | 'zoomNoFocalLength';
	takeId: string;
	slateId: string;
	slate: string;
	take: string;
	cameraLetter: string;
};

export type DayReport = {
	header: DayReportHeader;
	slates: DayReportSlate[];
	totals: DayReportTotals & { slates: number };
	/** In take order, end time first for a take with both. */
	warnings: DayReportWarning[];
};

function totals(takes: readonly FlatTake[]): DayReportTotals {
	return {
		takes: takes.length,
		circled: takes.filter((t) => t.take.circleTake).length,
		noGood: takes.filter((t) => t.take.noGood).length,
		photos: takes.reduce((n, t) => n + t.stills.length, 0)
	};
}

function setupsOf(takes: readonly FlatTake[]): DayReportSetup[] {
	const setups = new Map<string, DayReportSetup>();
	for (const row of takes) {
		if (!row.cameraSetup) continue;
		const setup = setups.get(row.cameraSetup.id) ?? { cameraSetupId: row.cameraSetup.id, cameraLetter: row.cameraLetter, camera: row.camera, lenses: [] };
		if (!setup.camera && row.camera) setup.camera = row.camera;
		if (row.lens && !setup.lenses.some((l) => l.id === row.lens!.id)) setup.lenses.push(row.lens);
		setups.set(row.cameraSetup.id, setup);
	}
	return [...setups.values()].sort((a, b) => a.cameraLetter.localeCompare(b.cameraLetter, 'en', { numeric: true }));
}

function warningsOf(row: FlatTake): DayReportWarning[] {
	const base = { takeId: row.take.id, slateId: row.slate.id, slate: row.slate.slateUID ?? '', take: row.take.take ?? '', cameraLetter: row.cameraLetter };
	const out: DayReportWarning[] = [];
	if (!row.take.endedAt) out.push({ kind: 'noEndTime', ...base });
	if (!row.focalLength) out.push({ kind: row.lens && isZoom(row.lens) ? 'zoomNoFocalLength' : 'noFocalLength', ...base });
	return out;
}

/**
 * The report of one shoot day. Undefined when the day is not in the input. Every slate of the day
 * in the slate range has a block; with circled-only or no-good filters on, a slate left with no
 * takes is dropped.
 */
export function dayReport(input: ExportInput, shootDayId: string, filters: Omit<ExportFilters, 'shootDayIds'> = {}): DayReport | undefined {
	const day = input.shootDays.find((d) => d.id === shootDayId);
	if (!day) return undefined;
	const picked = { ...filters, shootDayIds: [shootDayId] };
	const rows = flatten(input, picked);
	const lighting = new Map(input.lightingSetups.map((l) => [l.id, l]));
	const takeFilters = !!(filters.circledOnly || filters.excludeNoGood);
	const slates = selectSlates(input, picked)
		.map((slate) => {
			const takes = rows.filter((r) => r.slate.id === slate.id);
			return { slate, lightingSetup: slate.lightingSetupId ? lighting.get(slate.lightingSetupId) : undefined, setups: setupsOf(takes), takes, totals: totals(takes) };
		})
		.filter((block) => !takeFilters || block.takes.length > 0);
	return {
		header: { project: input.project.name, shootDate: day.shootDate, shootDay: day.shootDay, unit: day.cameraUnit, location: day.location, wrangler: day.wrangler },
		slates,
		totals: { slates: slates.length, ...totals(rows) },
		warnings: rows.flatMap(warningsOf)
	};
}
