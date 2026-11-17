// An import of the DIT's clips, written: the plan's patch on the takes and the entry that keeps
// what it wrote, as one undo entry. Undo takes both back, so the next import of the day reads the
// fields as they were. Not pure: it writes through the editor.

import type { Editor } from '$lib/app/editor';
import type { Label } from '$lib/app/undo';
import { clipImportRecord, type FillPlan } from './plan';

/** The notice: how many takes the import filled. */
export function doneLabel(takes: number): Label {
	return { key: takes === 1 ? 'clips.done.one' : 'clips.done.other', params: { n: takes } };
}

/** `at`: the entry's id, its shoot day, when, and the file's name. */
export async function applyClipImport(app: { edit: Editor }, plan: FillPlan, at: Parameters<typeof clipImportRecord>[1]): Promise<void> {
	await app.edit.group(doneLabel(plan.counts.takes), async () => {
		if (plan.patch.length) await app.edit.apply('take', plan.patch);
		await app.edit.create('clipImport', clipImportRecord(plan, at));
	});
}
