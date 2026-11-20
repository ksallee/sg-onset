// What a notice says of the switches a take type or a kind of set reference turns on: "Slate 12A:
// Clean plate on", one clause for the slates and one for the lighting setups. And the words that
// show what a take is for beside it: its type, and each plate at its tail. Pure.

import type { Label } from '$lib/app/undo';
import { t, tk, type MessageKey } from '$lib/i18n/messages';
import { fieldLabel } from '$lib/i18n/modelText';
import { FIELDS, findField } from '$lib/model/catalogue';
import type { TakeTail } from '$lib/model/takeTail';
import { KIND_SWITCHES, TYPE_SWITCHES, type SwitchKey, type SwitchRef, type TakeType } from '$lib/model/takeType';

/** The name of a slate and of a lighting setup, by id. */
export type SwitchNames = { slate(id: string): string; lightingSetup(id: string): string };

type How = 'on' | 'stays' | 'off';

/** Each switch once, in the order the forms show them: the catalogue's. */
const at = (s: SwitchKey) => FIELDS.findIndex((d) => d.scope === s.scope && d.key === s.key);
const ORDER = [...Object.values(TYPE_SWITCHES), ...Object.values(KIND_SWITCHES)]
	.flatMap((list) => list ?? [])
	.filter((s, i, all) => all.findIndex((x) => x.scope === s.scope && x.key === s.key) === i)
	.sort((a, b) => at(a) - at(b));

/** One clause per scope, slates first: "Slate 12A: Clean plate on". */
function clauses(refs: readonly SwitchRef[], how: How, names: SwitchNames): { key: MessageKey; params: { where: string; switches: string } }[] {
	const out = [];
	for (const scope of ['slate', 'lightingSetup'] as const) {
		const mine = refs.filter((r) => r.scope === scope);
		if (!mine.length) continue;
		const ids = [...new Set(mine.map((r) => r.id))];
		const where =
			ids.length > 1
				? t(scope === 'slate' ? 'take.type.where.slates' : 'take.type.where.lightingSetups', { n: ids.length })
				: t(scope === 'slate' ? 'take.type.where.slate' : 'take.type.where.lightingSetup', { name: names[scope](ids[0]) });
		const keys = ORDER.filter((s) => s.scope === scope && mine.some((r) => r.key === s.key));
		const switches = keys.map((s) => fieldLabel(findField(scope, s.key)!.def)).join(', ');
		const key: MessageKey = how === 'stays' ? (keys.length > 1 ? 'take.type.stays.many' : 'take.type.stays.one') : how === 'on' ? 'take.type.on' : 'take.type.off';
		out.push({ key, params: { where, switches } });
	}
	return out;
}

/** On, stays on, or turned off: the clauses as one text. */
export function switchesText(refs: readonly SwitchRef[], how: How, names: SwitchNames): string {
	return clauses(refs, how, names)
		.map((c) => t(c.key, c.params))
		.join('. ');
}

/** The same as the label of an undo entry. Undefined for no switch. */
export function switchesLabel(refs: readonly SwitchRef[], how: How, names: SwitchNames): Label | undefined {
	const [first, second] = clauses(refs, how, names);
	if (!first) return undefined;
	if (!second) return first;
	return { key: 'take.type.done', params: { what: tk(first.key, first.params), then: tk(second.key, second.params) } };
}

/** What a take is for, as the take row and the take table show it: its type when it is not Main, then each plate at its tail. */
export function typeWords(type: TakeType | undefined, tails: readonly TakeTail[]): string[] {
	const words = type && type !== 'main' ? [tk(`field.take.takeType.${type}`)] : [];
	return [...words, ...tails.map((tail) => t('take.tail.word', { tail: tk(`field.take.takeTail.${tail}`) }))];
}

/** The undo label of a plate put at the tail of a take, or taken off it. */
export function tailLabel(take: string, tail: TakeTail, on: boolean): Label {
	return { key: on ? 'take.edit.tail.on' : 'take.edit.tail.off', params: { take, tail: tk(`field.take.takeTail.${tail}`) } };
}
