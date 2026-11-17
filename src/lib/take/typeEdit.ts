// A take edit that may change the take type, run on the store. The switches the new type turns on
// are set in the same undo entry, and the label says so. A switch the old type leaves on with no
// take of its type is offered to turn off, in the notice in place of Undo; ignored, nothing
// changes. The rules are pure (model/takeType.ts, typeText.ts); this reads what they need and
// writes through the editor. Every take edit that can set the type goes through here: the take
// sheet, a take opened from a slate, bulk edit.

import type { App } from '$lib/app/app.svelte';
import type { Label } from '$lib/app/undo';
import { t, tk } from '$lib/i18n/messages';
import type { Patch } from '$lib/model/patch';
import { planTypeEdit, turnOffPatch, type SwitchRef } from '$lib/model/takeType';
import type { LightingSetup, Slate, Take } from '$lib/model/types';
import { switchesLabel, switchesText, type SwitchNames } from './typeText';

type Around = { takes: Take[]; slates: Slate[]; lightingSetups: LightingSetup[] };

const present = <T>(rows: (T | undefined)[]): T[] => rows.filter((r): r is T => r !== undefined);

/** The takes given, their slates and lighting setups, and every take of every slate on those lighting setups. */
async function readAround(app: App, takeIds: readonly string[]): Promise<Around> {
	const store = app.store;
	const touched = present(await Promise.all(takeIds.map((id) => store.get('take', id))));
	const slateIds = new Set(touched.map((t) => t.slateId));
	const own = present(await Promise.all([...slateIds].map((id) => store.get('slate', id))));
	const lightIds = new Set(own.flatMap((s) => (s.lightingSetupId ? [s.lightingSetupId] : [])));
	const lightingSetups = present(await Promise.all([...lightIds].map((id) => store.get('lightingSetup', id))));
	const slates = lightIds.size ? (await store.list('slate')).filter((s) => slateIds.has(s.id) || (s.lightingSetupId !== undefined && lightIds.has(s.lightingSetupId))) : own;
	const takes = (await Promise.all(slates.map((s) => store.list('take', s.id)))).flat();
	return { takes, slates, lightingSetups };
}

const namesOf = (around: Pick<Around, 'slates' | 'lightingSetups'>): SwitchNames => ({
	slate: (id) => around.slates.find((s) => s.id === id)?.slateUID ?? '',
	lightingSetup: (id) => around.lightingSetups.find((l) => l.id === id)?.label ?? ''
});

/** Applies a take patch as one undo entry, with what a change of take type does to the switches. */
export async function applyTakeEdit(app: App, patch: Patch, label: Label): Promise<void> {
	const typed = [...new Set(patch.filter((c) => c.key === 'takeType').map((c) => c.id))];
	if (!typed.length) {
		await app.edit.apply('take', patch, label);
		return;
	}
	const around = await readAround(app, typed);
	const plan = planTypeEdit({ patch, ...around });
	const names = namesOf(around);
	const done: Label = plan.on.length ? { key: 'take.type.done', params: { what: tk(label.key, label.params), then: switchesText(plan.on, 'on', names) } } : label;
	await app.edit.group(done, async () => {
		await app.edit.apply('take', plan.take);
		if (plan.slate.length) await app.edit.apply('slate', plan.slate);
		if (plan.lightingSetup.length) await app.edit.apply('lightingSetup', plan.lightingSetup);
	});
	// Only on this edit's own notice: another edit since has its own.
	if (plan.left.length && app.lastEdit?.label === done) {
		const left = plan.left;
		app.offer({ text: switchesText(left, 'stays', names), action: t('take.type.turnOff'), run: () => turnOff(app, left) });
	}
}

/** Turns off the switches given that are still on, as one undo entry. */
async function turnOff(app: App, refs: readonly SwitchRef[]): Promise<void> {
	const ids = (scope: SwitchRef['scope']) => [...new Set(refs.filter((r) => r.scope === scope).map((r) => r.id))];
	const slates = present(await Promise.all(ids('slate').map((id) => app.store.get('slate', id))));
	const lightingSetups = present(await Promise.all(ids('lightingSetup').map((id) => app.store.get('lightingSetup', id))));
	const patch = turnOffPatch(refs, slates, lightingSetups);
	const off = refs.filter((r) => [...patch.slate, ...patch.lightingSetup].some((c) => c.id === r.id && c.key === r.key));
	const label = switchesLabel(off, 'off', namesOf({ slates, lightingSetups }));
	if (!label) return;
	await app.edit.group(label, async () => {
		if (patch.slate.length) await app.edit.apply('slate', patch.slate);
		if (patch.lightingSetup.length) await app.edit.apply('lightingSetup', patch.lightingSetup);
	});
}
