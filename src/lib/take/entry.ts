// What the dock's keys do to the text being typed into a take's number, and what that text is
// as a stored value. Numbers go through the keypad's own rules (ios/keypad.ts); a length in
// imperial is typed as feet and inches with their marks, 6' 3". The model reads the text
// (`readField`), so what is stored is what the rest of the app would store. Pure.

import { readField } from '$lib/app/fieldEdit';
import type { FieldDef } from '$lib/model/catalogue';
import { formatLength, metres, type UnitSystem } from '$lib/model/length';
import type { FieldValue } from '$lib/model/types';
import type { Issue } from '$lib/model/validate';
import { canStep, entryValue, formatNumber, keypadPress, stepValue, type Key } from '$lib/ios/keypad';
import { slotKey, type EntrySpec } from './fields';

/** The keypad's keys, the feet and inch marks, and infinity. */
export type EntryKey = Key | 'feet' | 'inches' | 'inf';

/** `fresh`: it still shows the stored value; the first key replaces it. */
export interface FieldEntry {
	text: string;
	fresh: boolean;
}

export type Committed = { ok: true; value: FieldValue | undefined } | { ok: true; unchanged: true } | { ok: false; issue: Issue };

const INF = 'inf';
const M_PER_INCH = 0.0254;

export function startEntry(text: string): FieldEntry {
	return { text, fresh: true };
}

const typed = (text: string): FieldEntry => ({ text, fresh: false });

function feetInches(text: string, key: EntryKey): string {
	const last = text.at(-1) ?? '';
	const digit = /\d/.test(last);
	const segment = text.slice(text.lastIndexOf(' ') + 1);
	switch (key) {
		case 'clear':
			return '';
		case 'back':
			return text.slice(0, -1).trimEnd();
		case 'sign':
			return text.startsWith('-') ? text.slice(1) : `-${text}`;
		case 'feet':
			return digit && !text.includes("'") && !text.includes('"') ? `${text}' ` : text;
		case 'inches':
			return digit && !text.includes('"') ? `${text}"` : text;
		case '.':
			if (text.includes('"') || segment.includes('.')) return text;
			return digit ? `${text}.` : `${text}0.`;
		case 'inf':
			return text;
		default:
			return text.includes('"') ? text : text + key;
	}
}

/** One key. A fresh entry, or infinity, is replaced by the first digit or point. */
export function pressEntry(entry: FieldEntry, key: EntryKey, es: EntrySpec): FieldEntry {
	if (key === 'inf') return es.infinity ? typed(INF) : entry;
	const base = entry.text === INF ? { text: '', fresh: false } : entry;
	if (es.mode === 'feetInches') {
		const from = base.fresh && key !== 'back' ? '' : base.text;
		return typed(feetInches(from, key));
	}
	if (key === 'feet' || key === 'inches') return entry;
	return keypadPress(base, key, es.spec);
}

/** The text as metres, or null when it reads as none. */
function lengthOf(def: FieldDef, text: string, units: UnitSystem): number | null {
	const read = readField('take', def.key, text, units);
	const value = read.ok ? (read.value as { m?: unknown } | undefined) : undefined;
	return typeof value?.m === 'number' ? value.m : null;
}

/** The stepper, from what is typed: one step of the keypad's grid or stops; an inch in feet and inches. */
export function stepEntry(entry: FieldEntry, dir: 1 | -1, es: EntrySpec, units: UnitSystem, def: FieldDef): FieldEntry {
	if (entry.text === INF) return entry;
	if (es.mode === 'feetInches') {
		const m = (entry.text.trim() ? lengthOf(def, entry.text, units) : 0) ?? 0;
		const inches = Math.round(m / M_PER_INCH) + dir;
		const to = Math.min(es.spec.max, Math.max(es.spec.min, inches * M_PER_INCH));
		return typed(formatLength(metres(to), 'imperial'));
	}
	return typed(formatNumber(stepValue(entryValue(entry, es.spec), dir, es.spec), es.spec.decimals));
}

/** Whether the stepper can go that way: not past the range, not from infinity. */
export function canStepEntry(entry: FieldEntry, dir: 1 | -1, es: EntrySpec): boolean {
	if (entry.text === INF) return false;
	if (es.mode === 'feetInches') return true;
	return canStep(entryValue(entry, es.spec), dir, es.spec);
}

/**
 * The entry as the value to store under the field's key (`end`: its end key). A fresh entry is no
 * change. A number is kept to the keypad's range first; the model then checks it.
 */
export function commitEntry(def: FieldDef, end: boolean, entry: FieldEntry, es: EntrySpec, units: UnitSystem): Committed {
	if (entry.fresh) return { ok: true, unchanged: true };
	let text = entry.text.trim();
	if (es.mode === 'number' && text !== INF && text !== '') {
		const n = entryValue(entry, es.spec);
		text = n === null ? '' : String(n);
	}
	const read = readField('take', slotKey(def.key, end), text, units);
	return read.ok ? { ok: true, value: read.value } : { ok: false, issue: read.issue };
}
