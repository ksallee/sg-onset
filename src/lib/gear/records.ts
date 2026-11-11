// Cameras and lenses as forms: a new record from typed text, the check before one field is saved,
// a copy, and which record the gear page shows. Pure.

import { readField } from '$lib/app/fieldEdit';
import { fieldsOf, findField } from '$lib/model/catalogue';
import { formatField } from '$lib/model/fieldText';
import type { UnitSystem } from '$lib/model/length';
import type { Camera, FieldValue, Lens } from '$lib/model/types';
import { validateRecord, type Issue } from '$lib/model/validate';
import type { GearScope } from './names';

const SERIAL: Record<GearScope, string> = { camera: 'cameraSerialNumber', lens: 'lensSerialNumber' };

/**
 * A copy under a new id, for a second unit of the same model. The serial number stays behind: no
 * two units share one.
 */
export function duplicateGear<T extends Camera | Lens>(scope: GearScope, record: T, id: string): T {
	const copy: Record<string, unknown> = { ...record, id };
	delete copy[SERIAL[scope]];
	return copy as T;
}

/** The issue across fields that lands on `key`: a zoom's long end under its short end. */
function crossIssue(scope: GearScope, record: object, key: string): Issue | undefined {
	const issues = validateRecord(scope, record);
	if (scope === 'lens' && (key === 'focalLength' || key === 'focalLengthMax')) return issues.focalLengthMax?.[0];
	return issues[key]?.[0];
}

export type Draft<T> = { ok: boolean; record: T; issues: Record<string, Issue> };

/** A new camera or lens from the text of each field. `ok` when it has a model and every field reads. */
export function draftRecord(scope: GearScope, texts: Record<string, string>, units: UnitSystem, id: string, projectId: string): Draft<Camera | Lens> {
	const record: Record<string, unknown> = { id, projectId };
	const issues: Record<string, Issue> = {};
	for (const def of fieldsOf(scope)) {
		const read = readField(scope, def.key, texts[def.key] ?? '', units);
		if (!read.ok) issues[def.key] = read.issue;
		else if (read.value !== undefined) record[def.key] = read.value;
	}
	for (const [key, list] of Object.entries(validateRecord(scope, record))) issues[key] ??= list[0];
	return { ok: Object.keys(issues).length === 0, record: record as Camera | Lens, issues };
}

/** What typing `text` into field `key` of `record` saves, or the issue to show instead. */
export function checkEdit(scope: GearScope, record: Camera | Lens, key: string, text: string, units: UnitSystem): { ok: true; value: FieldValue | undefined } | { ok: false; issue: Issue } {
	const read = readField(scope, key, text, units);
	if (!read.ok) return { ok: false, issue: read.issue };
	const next: Record<string, unknown> = { ...record };
	if (read.value === undefined) delete next[key];
	else next[key] = read.value;
	const issue = crossIssue(scope, next, key);
	return issue ? { ok: false, issue } : { ok: true, value: read.value };
}

/** A stored value as the text its field shows. */
export function fieldText(scope: GearScope, record: Camera | Lens, key: string, units: UnitSystem): string {
	const found = findField(scope, key);
	return found ? formatField(found.def, (record as Record<string, unknown>)[key], units) : '';
}

/** What the gear page shows: a camera, a lens or a camera setup, by id. In the address as `scope.id`. */
export type Selection = { scope: GearScope | 'cameraSetup'; id: string };

export function parseSelection(text: string | null | undefined): Selection | undefined {
	const m = /^(camera|lens|cameraSetup)\.(.+)$/.exec(text ?? '');
	return m ? { scope: m[1] as Selection['scope'], id: m[2] } : undefined;
}

export function formSelection(selection: Selection): string {
	return `${selection.scope}.${selection.id}`;
}
