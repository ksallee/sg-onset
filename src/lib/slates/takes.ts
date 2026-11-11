// The takes as the tables show them: a slate's takes, and the flat list of a day's takes for bulk
// edit, with the filters (slate, camera setup, time of day). Pure; the clock is never read, a
// time of day is the local one of a stored timestamp.

import { takeRows, type TakeRow } from '$lib/app/takeRows';
import { sortSlates } from '$lib/app/context';
import type { CameraSetup, Lens, Slate, Take } from '$lib/model/types';

export interface TakeLine extends TakeRow {
	/** The first line of its take number (of its slate, in a day's list): the table groups on it. */
	first: boolean;
}

export interface DayTakeLine extends TakeLine {
	slate: Slate;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** By take number as a person counts, then by camera letter. */
function byNumber(rows: TakeRow[]): TakeLine[] {
	const sorted = [...rows].sort((a, b) => collator.compare(a.take.take ?? '', b.take.take ?? '') || collator.compare(a.camera, b.camera));
	return sorted.map((row, i) => ({ ...row, first: i === 0 || collator.compare(sorted[i - 1].take.take ?? '', row.take.take ?? '') !== 0 }));
}

/** One slate's takes: by take number, then camera. */
export function slateTakeLines(takes: readonly Take[], setups: readonly CameraSetup[], lenses: readonly Lens[]): TakeLine[] {
	return byNumber(takeRows(takes, setups, lenses));
}

/** Every take of the given slates: slates in counting order, then take number, then camera. */
export function dayTakeLines(slates: readonly Slate[], takes: readonly Take[], setups: readonly CameraSetup[], lenses: readonly Lens[]): DayTakeLine[] {
	return sortSlates(slates).flatMap((slate) =>
		slateTakeLines(
			takes.filter((t) => t.slateId === slate.id),
			setups,
			lenses
		).map((line) => ({ ...line, slate }))
	);
}

/** Minutes after local midnight, 0 to 1439. */
export type Clock = number;

export type TakeFilter = { slateIds?: ReadonlySet<string>; setupIds?: ReadonlySet<string>; from?: Clock; to?: Clock };

/** The lines that pass every filter set. A time filter leaves out takes never started. */
export function filterTakeLines<T extends DayTakeLine>(lines: readonly T[], filter: TakeFilter): T[] {
	return lines.filter((line) => {
		if (filter.slateIds?.size && !filter.slateIds.has(line.take.slateId)) return false;
		if (filter.setupIds?.size && !filter.setupIds.has(line.take.cameraSetupId ?? '')) return false;
		if (filter.from === undefined && filter.to === undefined) return true;
		const at = minuteOfDay(line.take.startedAt);
		if (at === undefined) return false;
		return (filter.from === undefined || at >= filter.from) && (filter.to === undefined || at <= filter.to);
	});
}

/** The camera setups the takes use, by letter. */
export function setupOptions(takes: readonly Take[], setups: readonly CameraSetup[]): CameraSetup[] {
	const used = new Set(takes.map((t) => t.cameraSetupId));
	return setups.filter((s) => used.has(s.id)).sort((a, b) => collator.compare(a.cameraLabel ?? '', b.cameraLabel ?? ''));
}

/** The local time of day of a timestamp, in minutes. */
export function minuteOfDay(timestamp: string | undefined): Clock | undefined {
	const ms = Date.parse(timestamp ?? '');
	if (Number.isNaN(ms)) return undefined;
	const d = new Date(ms);
	return d.getHours() * 60 + d.getMinutes();
}

/** A typed time of day: "9:05", "09.05", "0905", "905", "9". Blank is none (undefined); text that is no time is null. */
export function parseClock(text: string): Clock | undefined | null {
	const t = text.trim();
	if (t === '') return undefined;
	const m = /^(\d{1,2})(?:[:.h](\d{2}))?$/.exec(t) ?? /^(\d{1,2})(\d{2})$/.exec(t);
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2] ?? 0);
	return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/** A time of day as "09:05". */
export function formatClock(clock: Clock): string {
	return `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
}
