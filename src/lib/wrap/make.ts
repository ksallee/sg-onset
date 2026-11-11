// The table files of a wrap package, made with the export modules for what was picked, and the
// honest notes about each: what it leaves out or cannot fill. Pure: the time, the time zone and
// the labels come in.

import { CRIF_NEVER_FILLED, exportCrif } from '$lib/export/crif';
import { exportAle, type AleResult } from '$lib/export/ale';
import { exportJson } from '$lib/export/json';
import { plainCsv, type PlainLabels } from '$lib/export/plainCsv';
import { flatten, type ExportFilters, type ExportInput, type FlatTake } from '$lib/export/selection';
import { wantsText, type TextKind, type WrapChoice } from './choice';

export type Note = { key: string; params: Record<string, string | number> };

export type MakeContext = { now: string; timeZone: string; labels: PlainLabels };

export type Made = {
	rows: FlatTake[];
	filters: ExportFilters;
	texts: Partial<Record<TextKind, string>>;
	notes: Record<TextKind, Note[]>;
	ale?: AleResult;
};

/** `<base>.one` for one, `<base>.other` for any other count. */
export function plural(base: string, n: number): string {
	return `${base}.${n === 1 ? 'one' : 'other'}`;
}

/** The required CRIF columns most often left empty, at most three, commonest first. */
function commonest(missing: { columns: string[] }[]): string[] {
	const counts = new Map<string, number>();
	for (const m of missing) for (const c of m.columns) counts.set(c, (counts.get(c) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
}

export function makeTexts(input: ExportInput, choice: WrapChoice, dayIds: readonly string[], ctx: MakeContext): Made {
	const filters: ExportFilters = { shootDayIds: dayIds.length ? [...dayIds] : ['∅'], circledOnly: choice.circledOnly, excludeNoGood: choice.excludeNoGood };
	const rows = flatten(input, filters);
	const texts: Made['texts'] = {};
	const notes: Made['notes'] = { crif: [], plainCsv: [], ale: [], json: [] };
	let ale: AleResult | undefined;
	for (const kind of wantsText(choice)) {
		if (kind === 'crif') {
			const crif = exportCrif(rows, { timeZone: ctx.timeZone, now: ctx.now, lengths: choice.lengths });
			texts.crif = crif.text;
			notes.crif.push({ key: 'wrap.note.crif.never', params: { columns: CRIF_NEVER_FILLED.join(', ') } });
			const lacking = crif.missing.filter((m) => m.columns.length > 0);
			if (lacking.length) notes.crif.push({ key: plural('wrap.note.crif.missing', lacking.length), params: { n: lacking.length, columns: commonest(lacking).join(', ') } });
			if (choice.lengths === 'metric') notes.crif.push({ key: 'wrap.note.crif.metric', params: {} });
		} else if (kind === 'plainCsv') {
			texts.plainCsv = plainCsv(rows, { labels: ctx.labels, header: 'labels', units: choice.plainUnits, lengths: choice.lengths, bom: true });
		} else if (kind === 'ale') {
			ale = exportAle(rows, {});
			texts.ale = ale.text;
			for (const w of ale.warnings) {
				if (w.kind === 'noTimecode') notes.ale.push({ key: plural('wrap.note.ale.noTimecode', w.takeIds.length), params: { n: w.takeIds.length } });
				if (w.kind === 'badTimecode') notes.ale.push({ key: plural('wrap.note.ale.badTimecode', w.takeIds.length), params: { n: w.takeIds.length } });
				if (w.kind === 'noFps') notes.ale.push({ key: 'wrap.note.ale.noFps', params: {} });
			}
		} else {
			texts.json = exportJson(input, { now: ctx.now, filters });
		}
	}
	return { rows, filters, texts, notes, ale };
}
