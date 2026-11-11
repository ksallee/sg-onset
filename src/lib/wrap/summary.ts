// The day at a glance, for wrap: counts, the time the cameras ran, the cameras used, and what is
// still missing as a to-do list of takes. From the day report (`$lib/export/dayReport`). Pure.

import type { DayReport, DayReportWarning } from '$lib/export/dayReport';
import type { Take } from '$lib/model/types';

export type TodoItem = {
	takeId: string;
	slateId: string;
	slate: string;
	take: string;
	cameraLetter: string;
	kinds: DayReportWarning['kind'][];
};

export type CameraUse = { letter: string; body?: string; takes: number };

export type DaySummary = {
	slates: number;
	takes: number;
	circled: number;
	noGood: number;
	photos: number;
	/** The time any camera ran, overlaps counted once. Takes with no end are left out. */
	runningMs: number;
	cameras: CameraUse[];
	todo: TodoItem[];
};

/** The time covered by the takes' start to end, overlaps counted once. */
export function runningTime(takes: readonly Pick<Take, 'startedAt' | 'endedAt'>[]): number {
	const spans = takes
		.map((t) => [Date.parse(t.startedAt ?? ''), Date.parse(t.endedAt ?? '')] as const)
		.filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
		.sort((a, b) => a[0] - b[0]);
	let total = 0;
	let end = -Infinity;
	for (const [s, e] of spans) {
		if (e <= end) continue;
		total += e - Math.max(s, end);
		end = e;
	}
	return total;
}

/** "48 s", "12 min", "1 h 05 min". */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	if (seconds > 0 && seconds < 60) return `${seconds} s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} min`;
	return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

export function daySummary(report: DayReport): DaySummary {
	const rows = report.slates.flatMap((s) => s.takes);
	const cameras = new Map<string, CameraUse>();
	for (const row of rows) {
		if (!row.cameraSetup) continue;
		const use = cameras.get(row.cameraLetter) ?? { letter: row.cameraLetter, takes: 0 };
		use.takes += 1;
		if (!use.body && row.camera) use.body = [row.camera.cameraMake, row.camera.cameraModel].filter(Boolean).join(' ') || undefined;
		cameras.set(row.cameraLetter, use);
	}
	const todo: TodoItem[] = [];
	for (const w of report.warnings) {
		const last = todo.at(-1);
		if (last?.takeId === w.takeId) last.kinds.push(w.kind);
		else todo.push({ takeId: w.takeId, slateId: w.slateId, slate: w.slate, take: w.take, cameraLetter: w.cameraLetter, kinds: [w.kind] });
	}
	return {
		slates: report.totals.slates,
		takes: report.totals.takes,
		circled: report.totals.circled,
		noGood: report.totals.noGood,
		photos: report.totals.photos,
		runningMs: runningTime(rows.map((r) => r.take)),
		cameras: [...cameras.values()].sort((a, b) => a.letter.localeCompare(b.letter, 'en', { numeric: true })),
		todo
	};
}
