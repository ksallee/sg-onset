// The first run, decided: where the way in leads, what the page offers, what stops the form,
// where a new project lands, and the draft that keeps what was typed. Pure.

import type { FirstRun } from '$lib/app/records';
import type { InstallHint } from '$lib/pwa/platform';

/** The way in: the first run on a device with no project, else Shoot. A returning person sees no first run. */
export function entryRoute(projects: number): '/welcome' | '/shoot' {
	return projects === 0 ? '/welcome' : '/shoot';
}

/** `first`: the device holds nothing. `another`: one more project, from the picker. */
export function firstRunMode(projects: number): 'first' | 'another' {
	return projects === 0 ? 'first' : 'another';
}

/**
 * Whether to show how to add the app to the Home Screen. Only in a tab on iPadOS or iOS, where
 * Safari clears a site unused for seven days, and never again once dismissed. Installed is `none`.
 */
export function installOffer(hint: InstallHint, dismissed: boolean): 'none' | 'ios-share' | 'ios-open-in-safari' {
	if (dismissed || hint === 'none' || hint === 'browser') return 'none';
	return hint;
}

export type Draft = Required<FirstRun>;
export type DraftField = 'name' | 'date' | 'dayNumber';
export type Problems = Partial<Record<DraftField, `welcome.problem.${DraftField}`>>;

function isDate(text: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (!m) return false;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** What stops the form, per field, as message keys. A day number that would be dropped is said, not lost. */
export function firstRunProblems(input: FirstRun): Problems {
	const problems: Problems = {};
	if (input.name.trim() === '') problems.name = 'welcome.problem.name';
	if (!isDate(input.date)) problems.date = 'welcome.problem.date';
	const day = (input.dayNumber ?? '').trim();
	if (day !== '' && !/^[1-9]\d{0,3}$/.test(day)) problems.dayNumber = 'welcome.problem.dayNumber';
	return problems;
}

const ORDER: readonly DraftField[] = ['name', 'date', 'dayNumber'];

/** The first field to fix, in the order of the form: it gets the focus. */
export function firstProblem(problems: Problems): DraftField | undefined {
	return ORDER.find((field) => problems[field]);
}

/** Where a new project lands: its slates, by way of sign-in when the person asked for it. */
export function afterCreate(signIn: boolean): string {
	return signIn ? `/sign-in?next=${encodeURIComponent('/slates')}` : '/slates';
}

/** The form as it starts: what was typed before a reload, else empty, today, day 1. */
export function draftOf(kept: Partial<Draft> | undefined, today: string): Draft {
	return {
		name: kept?.name ?? '',
		date: kept?.date && isDate(kept.date) ? kept.date : today,
		dayNumber: kept?.dayNumber ?? '1',
		unit: kept?.unit ?? '',
		location: kept?.location ?? ''
	};
}

export function serializeDraft(draft: Draft): string {
	return JSON.stringify(draft);
}

/** A kept draft. Anything unreadable is no draft. */
export function parseDraft(raw: string | null | undefined): Partial<Draft> | undefined {
	let value: unknown;
	try {
		value = raw ? JSON.parse(raw) : null;
	} catch {
		return undefined;
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const v = value as Record<string, unknown>;
	const text = (x: unknown) => (typeof x === 'string' ? x : undefined);
	return { name: text(v.name), date: text(v.date), dayNumber: text(v.dayNumber), unit: text(v.unit), location: text(v.location) };
}
