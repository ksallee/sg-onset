// The templates list: order, how many entries follow each, the name of a copy, and the patch of
// an edit to a template. Pure.

import { change, type Change, type Patch } from '$lib/model/patch';
import type { TemplateRecord } from '$lib/model/template';
import { sameValue } from '$lib/model/value';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** By name, as a person counts. */
export function sortTemplates<T extends { name: string }>(templates: readonly T[]): T[] {
	return [...templates].sort((a, b) => collator.compare(a.name, b.name));
}

/** How many entries are linked to each template, by template id. */
export function linkCounts(records: readonly { templateId?: string }[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const r of records) if (r.templateId) out.set(r.templateId, (out.get(r.templateId) ?? 0) + 1);
	return out;
}

/**
 * A free name for a copy: "Day ext" → "Day ext 2", "Day ext 2" → "Day ext 3", past names in use
 * (whatever the case). `self`: the name itself when it is free.
 */
export function copyName(name: string, names: readonly string[], self = false): string {
	const used = new Set(names.map((n) => n.trim().toLowerCase()));
	const base = name.trim();
	if (self && !used.has(base.toLowerCase())) return base;
	const m = /^(.*?)\s+(\d+)$/.exec(base);
	const stem = m ? m[1] : base;
	let n = m ? Number(m[2]) + 1 : 2;
	while (used.has(`${stem} ${n}`.toLowerCase())) n++;
	return `${stem} ${n}`;
}

/** The patch of an edit to a template: its name, trimmed, and its values, when they changed. */
export function templateEditPatch(template: TemplateRecord, name: string, values: object): Patch {
	const out: Change[] = [];
	if (name.trim() !== template.name) out.push(change(template, 'name', name.trim()));
	if (!sameValue(template.values, values)) out.push(change(template, 'values', values));
	return out;
}
