// A take template on the take screen. A take number is one record per camera, so the template is
// linked to every camera of it. The setup, the body and the lens tell the cameras apart: a
// template never writes them here, and they never count as changed. Pure.

import type { Patch } from '$lib/model/patch';
import { linkPreview } from '$lib/slates/bulk';
import { diverged, reapplyPatch, unlinkPatch } from '$lib/templates/divergence';
import type { TakeGroup } from './groups';

type AnyTemplate = { id: string; values: object };

/** What makes a camera's take that camera's. */
const CAMERA_KEYS = new Set(['cameraSetupId', 'cameraId', 'lensId']);

/** The template without the camera fields. */
function shared(template: AnyTemplate): AnyTemplate {
	return { id: template.id, values: Object.fromEntries(Object.entries(template.values).filter(([key]) => !CAMERA_KEYS.has(key))) };
}

/** The template the take follows: none, one for every camera, or not the same on each. */
export type GroupLink = { kind: 'none' } | { kind: 'one'; id: string } | { kind: 'mixed' };

export function groupLink(group: TakeGroup): GroupLink {
	const ids = new Set(group.takes.map((t) => t.templateId));
	if (ids.size > 1) return { kind: 'mixed' };
	const [id] = ids;
	return id === undefined ? { kind: 'none' } : { kind: 'one', id };
}

/** Links every camera of the take to the template and fills the values it holds. */
export function groupLinkPatch(group: TakeGroup, template: AnyTemplate): Patch {
	return linkPreview(
		group.takes,
		group.takes.map((t) => t.id),
		shared(template)
	).patch;
}

/** The template fields any camera no longer holds, in template order. */
export function groupChanged(group: TakeGroup, template: AnyTemplate): string[] {
	const tp = shared(template);
	const changed = new Set(group.takes.flatMap((t) => diverged(tp, t)));
	return Object.keys(tp.values).filter((key) => changed.has(key));
}

/** Puts the template values back on every camera. */
export function groupResetPatch(group: TakeGroup, template: AnyTemplate): Patch {
	const tp = shared(template);
	return group.takes.flatMap((t) => reapplyPatch(tp, t));
}

/** Clears the link on every camera. The values stay. */
export function groupUnlinkPatch(group: TakeGroup): Patch {
	return group.takes.flatMap(unlinkPatch);
}
