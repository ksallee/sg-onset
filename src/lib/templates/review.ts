// The review before a template edit is saved: from the model's preview, what each choice would
// change on the linked entries. "Only fields that hold the old template value" changes the
// untouched fields and keeps the ones changed by hand; "All fields" changes both. Pure.

import type { TemplateChange } from '$lib/model/template';

export type ReviewField = { key: string; from: unknown; to: unknown; touched: boolean };
export type ReviewRecord = { id: string; fields: ReviewField[] };
export type Count = { records: number; fields: number };

export interface TemplateReview {
	/** Each linked entry that would change under "All fields", with its fields, in entry order. */
	records: ReviewRecord[];
	/** What "Only fields that hold the old template value" changes. */
	untouched: Count;
	/** What "All fields" changes. */
	all: Count;
	/** The fields changed by hand: kept by the first choice, overwritten by the second. */
	kept: Count;
	/** Per field: how many entries hold the old value, how many were changed by hand. */
	byField: { key: string; untouched: number; touched: number }[];
	/** The two choices differ: something was changed by hand. */
	choice: boolean;
}

export function templateReview(changes: readonly TemplateChange[]): TemplateReview {
	const records: ReviewRecord[] = [];
	const byId = new Map<string, ReviewRecord>();
	const byField = new Map<string, { key: string; untouched: number; touched: number }>();
	for (const { id, key, from, to, touched } of changes) {
		let record = byId.get(id);
		if (!record) {
			record = { id, fields: [] };
			byId.set(id, record);
			records.push(record);
		}
		record.fields.push({ key, from, to, touched });
		const sum = byField.get(key) ?? { key, untouched: 0, touched: 0 };
		sum[touched ? 'touched' : 'untouched'] += 1;
		byField.set(key, sum);
	}
	const count = (pick: (f: ReviewField) => boolean): Count => {
		const hit = records.map((r) => r.fields.filter(pick).length).filter((n) => n > 0);
		return { records: hit.length, fields: hit.reduce((a, b) => a + b, 0) };
	};
	const kept = count((f) => f.touched);
	return { records, untouched: count((f) => !f.touched), all: count(() => true), kept, byField: [...byField.values()], choice: kept.fields > 0 };
}
