// The first rows of a table file, to look at before handing it over. Pure.

import { parseCsv } from '$lib/model/csv';
import type { TextKind } from './choice';

export type Preview = { header: string[]; rows: string[][]; total: number };

/** The Column line and the Data lines of an ALE, split on tabs. */
export function readAle(text: string): string[][] {
	const lines = text.split(/\r?\n/);
	const column = lines.indexOf('Column');
	const data = lines.indexOf('Data');
	if (column < 0) return [];
	const header = lines[column + 1]?.split('\t') ?? [];
	const rows = data < 0 ? [] : lines.slice(data + 1).filter((l) => l !== '').map((l) => l.split('\t'));
	return [header, ...rows];
}

/** CRIF splits Set Media values with a vertical tab, and writes a line break as one. */
const shown = (cell: string) => cell.replace(/\v/g, ' · ');

export function previewTable(kind: Exclude<TextKind, 'json'>, text: string, max = 8): Preview {
	const all = kind === 'ale' ? readAle(text) : parseCsv(text, ',').filter((r) => !(r.length === 1 && r[0] === ''));
	const [header = [], ...rows] = all;
	return { header, rows: rows.slice(0, max).map((r) => r.map(shown)), total: rows.length };
}
