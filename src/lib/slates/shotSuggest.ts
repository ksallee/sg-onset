// The VFX shots field of a slate, with a network: the Shot codes of the Flow PT project offered
// as the code is typed. Offline there are no codes and the field is free text. Pure.

import { codeKey } from '$lib/fpt/shots';
import { LIST_SEPARATOR, parseList } from '$lib/model/fieldText';

/** At most this many codes offered at once: one row of chips. */
export const SUGGEST_CAP = 6;

/** The code being typed: what follows the last separator, trimmed. */
export function currentCode(text: string): string {
	const parts = text.split(LIST_SEPARATOR);
	return parts[parts.length - 1].trim();
}

/**
 * The codes to offer: those that start with what is typed, then those that hold it, whatever the
 * case, in the order given. Codes already typed are left out, and nothing is offered until a
 * character is typed or once the typed code is one of them.
 */
export function suggestCodes(text: string, codes: readonly string[], cap = SUGGEST_CAP): string[] {
	const typed = codeKey(currentCode(text));
	if (!typed) return [];
	const held = new Set(parseList(text).map(codeKey));
	if (codes.some((c) => codeKey(c) === typed)) return [];
	const open = codes.filter((c) => !held.has(codeKey(c)));
	const starts = open.filter((c) => codeKey(c).startsWith(typed));
	const holds = open.filter((c) => !codeKey(c).startsWith(typed) && codeKey(c).includes(typed));
	return [...starts, ...holds].slice(0, cap);
}

/** The text with the picked code in place of the one being typed. */
export function pickCode(text: string, code: string): string {
	const before = text.split(LIST_SEPARATOR).slice(0, -1).join(',');
	return [...parseList(before), code].join(', ');
}
