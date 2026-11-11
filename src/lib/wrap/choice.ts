// What the wrangler picked to export: which days, which takes, which files, and the units the
// files offer. Plain data and the functions that change it. Pure.

import { compareShootDays, type ExportFilters } from '$lib/export/selection';
import type { ShootDay } from '$lib/model/types';

/** The files of a wrap package, in the order they are listed and zipped. */
export const FILE_KINDS = ['crif', 'plainCsv', 'ale', 'json', 'photos', 'report'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
/** The files that are a table of text, made by the export modules. */
export const TEXT_KINDS = ['crif', 'plainCsv', 'ale', 'json'] as const;
export type TextKind = (typeof TEXT_KINDS)[number];

/** This shoot day, several days, or the whole project. */
export type Span = 'day' | 'days' | 'project';

export type WrapChoice = {
	span: Span;
	/** The days picked when `span` is `days`. */
	dayIds: string[];
	circledOnly: boolean;
	excludeNoGood: boolean;
	files: FileKind[];
	/** CRIF lengths: feet and inches as the spec says, or metres. */
	lengths: 'imperial' | 'metric';
	/** Plain CSV: units in each cell, or bare numbers with a unit column. */
	plainUnits: 'inline' | 'columns';
};

export function defaultChoice(): WrapChoice {
	return { span: 'day', dayIds: [], circledOnly: false, excludeNoGood: false, files: [...FILE_KINDS], lengths: 'imperial', plainUnits: 'inline' };
}

/** The shoot days the choice covers, oldest first. */
export function pickedDays(choice: WrapChoice, currentDayId: string | undefined, days: readonly ShootDay[]): ShootDay[] {
	const picked =
		choice.span === 'project' ? days : choice.span === 'days' ? days.filter((d) => choice.dayIds.includes(d.id)) : days.filter((d) => d.id === currentDayId);
	return [...picked].sort(compareShootDays);
}

/** A day id no record has: `flatten` reads an empty list as every day. */
const NO_DAY = '∅';

/** The export modules' filters for the choice. */
export function exportFilters(choice: WrapChoice, currentDayId: string | undefined, days: readonly ShootDay[]): ExportFilters {
	const ids = pickedDays(choice, currentDayId, days).map((d) => d.id);
	return { shootDayIds: ids.length ? ids : [NO_DAY], circledOnly: choice.circledOnly, excludeNoGood: choice.excludeNoGood };
}

/** Another span. Several days starts from the current one. */
export function setSpan(choice: WrapChoice, span: Span, currentDayId: string | undefined): WrapChoice {
	const dayIds = span === 'days' && choice.dayIds.length === 0 && currentDayId ? [currentDayId] : choice.dayIds;
	return { ...choice, span, dayIds };
}

export function toggleFile(choice: WrapChoice, kind: FileKind): WrapChoice {
	const on = choice.files.includes(kind);
	return { ...choice, files: FILE_KINDS.filter((k) => (k === kind ? !on : choice.files.includes(k))) };
}

export function toggleDay(choice: WrapChoice, id: string): WrapChoice {
	return { ...choice, dayIds: choice.dayIds.includes(id) ? choice.dayIds.filter((d) => d !== id) : [...choice.dayIds, id] };
}

/** Whether a package can be built: a file and a day at least. */
export function readiness(choice: WrapChoice, dayCount: number): 'ok' | 'noFiles' | 'noDays' {
	if (choice.files.length === 0) return 'noFiles';
	if (dayCount === 0) return 'noDays';
	return 'ok';
}

/** The table files picked, in order. */
export function wantsText(choice: WrapChoice): TextKind[] {
	return TEXT_KINDS.filter((k) => choice.files.includes(k));
}
