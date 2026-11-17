// An edit of set references, run on the store: one added, one deleted, or one given another kind;
// and a slate deleted, whose lighting references move to another slate of its setup first (#107).
// The switches its kind turns on (HDRI 360, Witness camera, Lidar scan) are set in the same undo
// entry, and the label says so. A switch the last reference of its kind leaves on is offered to
// turn off, in the notice in place of Undo; ignored, nothing changes. As the take type does
// (#92): the rules are pure (model/takeType.ts `planReferenceEdit`, take/typeText.ts), the Turn
// Off is take/typeEdit.ts's. Not pure: this reads the store and writes through the editor.

import type { App } from '$lib/app/app.svelte';
import type { Label } from '$lib/app/undo';
import { t, tk } from '$lib/i18n/messages';
import { change } from '$lib/model/patch';
import { planReferenceEdit } from '$lib/model/takeType';
import type { LightingSetup, Reference, Slate, Take } from '$lib/model/types';
import { namesOf, turnOff } from '$lib/take/typeEdit';
import { switchesText } from '$lib/take/typeText';
import { deleteMoves } from './lighting';

type Around = { references: Reference[]; takes: Take[]; slates: Slate[]; lightingSetups: LightingSetup[] };

const present = <T>(rows: (T | undefined)[]): T[] => rows.filter((r): r is T => r !== undefined);

/** The slate, its lighting setup, every slate on it, and their references and takes. */
async function readAround(app: App, slateId: string): Promise<Around> {
	const store = app.store;
	const own = await store.get('slate', slateId);
	const lightId = own?.lightingSetupId;
	const light = lightId ? await store.get('lightingSetup', lightId) : undefined;
	const slates = light ? (await store.list('slate')).filter((s) => s.id === slateId || s.lightingSetupId === lightId) : present([own]);
	const references = (await Promise.all(slates.map((s) => store.list('reference', s.id)))).flat();
	const takes = (await Promise.all(slates.map((s) => store.list('take', s.id)))).flat();
	return { references, takes, slates, lightingSetups: present([light]) };
}

/** `write` makes the edit; `after` says what the references are once it is made. One undo entry. */
async function withSwitches(app: App, slateId: string, label: Label, after: (before: Reference[]) => Reference[], write: () => Promise<void>): Promise<void> {
	const around = await readAround(app, slateId);
	const plan = planReferenceEdit({ before: around.references, after: after(around.references), takes: around.takes, slates: around.slates, lightingSetups: around.lightingSetups });
	const names = namesOf(around);
	const done: Label = plan.on.length ? { key: 'take.type.done', params: { what: tk(label.key, label.params), then: switchesText(plan.on, 'on', names) } } : label;
	await app.edit.group(done, async () => {
		await write();
		if (plan.slate.length) await app.edit.apply('slate', plan.slate);
		if (plan.lightingSetup.length) await app.edit.apply('lightingSetup', plan.lightingSetup);
	});
	// Only on this edit's own notice: another edit since has its own.
	if (plan.left.length && app.lastEdit?.label === done) {
		const left = plan.left;
		app.offer({ text: switchesText(left, 'stays', names), action: t('take.type.turnOff'), run: () => turnOff(app, left) });
	}
}

/** Adds a reference, and turns on what its kind turns on. */
export function addReference(app: App, ref: Reference, label: Label): Promise<void> {
	return withSwitches(
		app,
		ref.slateId,
		label,
		(before) => [...before, ref],
		() => app.edit.create('reference', ref)
	);
}

/** Deletes a reference; offers to turn off a switch no reference or take holds any more. */
export function removeReference(app: App, ref: Reference, label: Label): Promise<void> {
	return withSwitches(
		app,
		ref.slateId,
		label,
		(before) => before.filter((r) => r.id !== ref.id),
		() => app.edit.remove('reference', ref.id)
	);
}

/** Gives a reference another kind: the new kind's switches on, the old kind's offered. */
export function setReferenceKind(app: App, ref: Reference, kind: string, label: Label): Promise<void> {
	return withSwitches(
		app,
		ref.slateId,
		label,
		(before) => before.map((r) => (r.id === ref.id ? { ...r, kind } : r)),
		async () => {
			await app.edit.set('reference', ref, 'kind', kind);
		}
	);
}

/**
 * Deletes a slate and what is under it. The lighting references logged on it first move to another
 * slate of its lighting setup (Kevin, #107; lighting.ts `deleteMoves`): they belong to the setup,
 * which outlives the slate. One undo entry brings back the slate and puts them back on it.
 */
export async function removeSlate(app: App, slate: Slate, label: Label): Promise<void> {
	const store = app.store;
	const [slates, days, refs] = await Promise.all([store.list('slate'), store.list('shootDay'), store.list('reference', slate.id)]);
	const moves = deleteMoves(slate.id, slates, days, refs);
	await app.edit.group(label, async () => {
		if (moves) await app.edit.apply('reference', moves.refs.map((r) => change(r, 'slateId', moves.to)));
		await app.edit.removeTree('slate', slate.id);
	});
}
