// A small CSV reader: RFC 4180 quoting, any line end, comma, semicolon or tab. It never throws;
// whatever the text, it returns rows. Pure.

const DELIMITERS = [',', ';', '\t'] as const;

/** The delimiter of the first line: the commonest of comma, semicolon and tab outside quotes. */
export function sniffDelimiter(text: string): string {
	const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
	let quoted = false;
	for (const c of text) {
		if (c === '"') quoted = !quoted;
		else if (!quoted && (c === '\n' || c === '\r')) break;
		else if (!quoted && c in counts) counts[c]++;
	}
	return DELIMITERS.reduce((best, d) => (counts[d] > counts[best] ? d : best), ',' as string);
}

/**
 * The rows of a CSV text, each a list of cells. Cells are trimmed outside quotes. A blank line is
 * a row with one empty cell. An unclosed quote runs to the end of the text.
 */
export function parseCsv(text: string, delimiter: string = sniffDelimiter(text)): string[][] {
	const src = text.startsWith('﻿') ? text.slice(1) : text;
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	/** Length of `cell` up to the end of its last quoted part: nothing before it is trimmed. */
	let kept = 0;
	let quoted = false;
	let started = false;

	const endCell = () => {
		row.push(cell.slice(0, kept) + cell.slice(kept).trimEnd());
		cell = '';
		kept = 0;
	};
	const endRow = () => {
		endCell();
		rows.push(row);
		row = [];
		started = false;
	};

	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (quoted) {
			if (c !== '"') cell += c;
			else if (src[i + 1] === '"') {
				cell += '"';
				i++;
			} else {
				quoted = false;
				kept = cell.length;
			}
			continue;
		}
		started = true;
		if (c === '"') quoted = true;
		else if (c === delimiter) endCell();
		else if (c === '\n' || c === '\r') {
			if (c === '\r' && src[i + 1] === '\n') i++;
			endRow();
		} else if (cell !== '' || !/\s/.test(c) || kept > 0) cell += c;
	}
	if (started || quoted) endRow();
	return rows;
}
