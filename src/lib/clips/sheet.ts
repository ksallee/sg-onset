// The DIT's file as a table: an ALE (ale.ts) or a CSV (the model's csv.ts), whichever the text
// is. A CSV's header is the first row, of the first 20, with a column known by name
// (columns.ts); without one, the first row of two cells or more, for the person to map. Pure.

import { parseCsv } from '$lib/model/csv';
import { isAle, parseAle } from './ale';
import { knownTarget } from './columns';

export type SheetRow = {
	/** 1-based line (ALE) or row (CSV) in the file. */
	line: number;
	cells: string[];
};

export type Sheet = {
	format: 'ale' | 'csv';
	/** An ALE's Heading block: FPS, VIDEO_FORMAT. Empty for a CSV. */
	heading: Record<string, string>;
	headers: string[];
	/** 1-based line of the header row. */
	headerRow: number;
	/** The rows under the header that are not blank. */
	rows: SheetRow[];
};

/** How many rows down a CSV header may sit, under title lines. */
const HEADER_SEARCH_ROWS = 20;

const filled = (cells: readonly string[]) => cells.filter((c) => c !== '').length;

/** The table in `text`, or null when it holds none. */
export function readSheet(text: string): Sheet | null {
	if (text.trim() === '') return null;
	if (isAle(text)) {
		const ale = parseAle(text)!;
		return { format: 'ale', heading: ale.heading, headers: ale.headers, headerRow: ale.headerLine, rows: ale.rows };
	}
	const table = parseCsv(text);
	const top = table.slice(0, HEADER_SEARCH_ROWS);
	let at = top.findIndex((cells) => cells.some((c) => knownTarget(c) !== undefined));
	if (at < 0) at = top.findIndex((cells) => filled(cells) >= 2);
	if (at < 0) return null;
	const rows: SheetRow[] = [];
	table.slice(at + 1).forEach((cells, i) => {
		if (filled(cells) > 0) rows.push({ line: at + 2 + i, cells });
	});
	return { format: 'csv', heading: {}, headers: table[at], headerRow: at + 1, rows };
}
