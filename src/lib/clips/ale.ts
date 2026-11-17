// Avid Log Exchange, read: the Heading block (FIELD_DELIM, VIDEO_FORMAT, FPS), the Column line,
// then the Data rows, all tab-separated. Any line end: Avid writes carriage returns, Silverstack
// and ARRI line feeds. Cells are trimmed. Never throws. Pure.

export type AleRow = {
	/** 1-based line in the file. */
	line: number;
	cells: string[];
};

export type Ale = {
	/** The Heading block, key to value: FPS, VIDEO_FORMAT. */
	heading: Record<string, string>;
	headers: string[];
	/** 1-based line of the column names. */
	headerLine: number;
	rows: AleRow[];
};

const lines = (text: string) => (text.startsWith('﻿') ? text.slice(1) : text).split(/\r\n|\r|\n/);
const cells = (line: string) => line.split('\t').map((c) => c.trim());
const isWord = (line: string, word: string) => line.trim().toLowerCase() === word;

/** An ALE: a line that says Column, and after it one that says Data. */
export function isAle(text: string): boolean {
	const all = lines(text);
	const column = all.findIndex((l) => isWord(l, 'column'));
	return column >= 0 && all.slice(column + 1).some((l) => isWord(l, 'data'));
}

/** The ALE in `text`, or null when it is not one. */
export function parseAle(text: string): Ale | null {
	const all = lines(text);
	const column = all.findIndex((l) => isWord(l, 'column'));
	if (column < 0) return null;
	const data = all.findIndex((l, i) => i > column && isWord(l, 'data'));
	if (data < 0) return null;

	const heading: Record<string, string> = {};
	const start = all.findIndex((l) => isWord(l, 'heading'));
	if (start >= 0 && start < column) {
		for (const line of all.slice(start + 1, column)) {
			const [key, ...rest] = line.split('\t');
			if (key.trim() !== '') heading[key.trim()] = rest.join('\t').trim();
		}
	}

	const offset = all.slice(column + 1, data).findIndex((l) => l.trim() !== '');
	const headerLine = offset < 0 ? column + 1 : column + 2 + offset;
	const headers = offset < 0 ? [] : cells(all[headerLine - 1]);
	while (headers.length && headers[headers.length - 1] === '') headers.pop();

	const rows: AleRow[] = [];
	all.slice(data + 1).forEach((line, i) => {
		if (line.trim() !== '') rows.push({ line: data + 2 + i, cells: cells(line) });
	});
	return { heading, headers, headerLine, rows };
}
