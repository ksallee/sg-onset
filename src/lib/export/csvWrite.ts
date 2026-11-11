// CSV out: RFC 4180 quoting, CRLF, an optional byte order mark for Excel, and an optional guard
// against cells a spreadsheet would run as a formula. Pure.

export const BOM = '\uFEFF';

/** A cell as RFC 4180 wants it: quoted when it holds a comma, a quote, a line break or edge space. */
export function csvCell(value: string): string {
	return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A number, signed or not, with at most a short unit after it: -5, +10, -5°, -5 mm. */
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)( ?[A-Za-z°]{1,4})?$/;

/**
 * A quote before a cell that starts with =, +, -, @, tab or carriage return, so Excel and Sheets
 * show it as text rather than run it (OWASP CSV injection). A number, signed or not, with at most a
 * short unit, is left alone: it cannot run, and a tilt of -5 must stay a number.
 */
export function guardFormula(value: string): string {
	return /^[=+\-@\t\r]/.test(value) && !NUMBER.test(value) ? `'${value}` : value;
}

export type CsvOptions = { bom?: boolean; guardFormulas?: boolean };

/** Rows to CSV text, each row ended by CRLF. */
export function csvText(rows: readonly (readonly string[])[], options: CsvOptions = {}): string {
	const cell = options.guardFormulas ? (v: string) => csvCell(guardFormula(v)) : csvCell;
	const body = rows.map((row) => row.map(cell).join(',') + '\r\n').join('');
	return (options.bom ? BOM : '') + body;
}
