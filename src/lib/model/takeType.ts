// The take type: what a take is for. No value is Main. Two types file the take with what its slate
// and lighting setup record: a clean plate turns on the slate's Clean plate, balls and chart turn on
// the lighting setup's Grey and chrome balls and Colour chart. The app turns a switch on, never off.
// A switch still on when no take holds its type any more is offered to turn off. Pure.

import { FIELDS } from './catalogue';
import { applyPatch, change, type Change, type Patch } from './patch';
import type { LightingSetup, Slate, Take } from './types';

type TakeTypeDef = Extract<(typeof FIELDS)[number], { scope: 'take'; key: 'takeType' }>;

/** Every type, Main first, as the catalogue lists them. */
export const TAKE_TYPES: TakeTypeDef['options'] = FIELDS.find((d): d is TakeTypeDef => d.scope === 'take' && d.key === 'takeType')!.options;
export type TakeType = TakeTypeDef['options'][number];

/** One yes-or-no field a type turns on. */
export type SwitchKey = { scope: 'slate'; key: 'cleanPlate' } | { scope: 'lightingSetup'; key: 'referenceBalls' | 'colourChart' };
/** That field on one record. */
export type SwitchRef = SwitchKey & { id: string };

/** The switches each type turns on. The others turn on nothing. */
export const TYPE_SWITCHES: Readonly<Partial<Record<TakeType, readonly SwitchKey[]>>> = {
	cleanPlate: [{ scope: 'slate', key: 'cleanPlate' }],
	ballsAndChart: [
		{ scope: 'lightingSetup', key: 'referenceBalls' },
		{ scope: 'lightingSetup', key: 'colourChart' }
	]
};

const isType = (value: unknown): value is TakeType => (TAKE_TYPES as readonly unknown[]).includes(value);

/** The type of a take. No value, or a value this version does not know, is Main. */
export function takeTypeOf(take: { takeType?: string }): TakeType {
	return isType(take.takeType) ? take.takeType : 'main';
}

/** The value stored for a type: Main is no value, so every Main take reads the same. */
export function storedTakeType(type: string | undefined): string | undefined {
	return type === 'main' ? undefined : type;
}

/** Sets the type on every take given: every camera of one take number. */
export function typePatch(takes: readonly Take[], type: TakeType): Patch {
	const to = storedTakeType(type);
	return takes.filter((t) => t.takeType !== to).map((t) => change(t, 'takeType', to));
}

/** The type the takes agree on; undefined when they differ, or there is none. */
export function groupType(takes: readonly Take[]): TakeType | undefined {
	const types = new Set(takes.map(takeTypeOf));
	return types.size === 1 ? [...types][0] : undefined;
}

export type TypeEditInput = {
	/** A take patch. Its `takeType` changes are what counts; the rest passes through. */
	patch: Patch;
	/** Before the patch: every take of the slates it touches, and of every slate on their lighting setups. */
	takes: readonly Take[];
	/** Those slates. */
	slates: readonly Slate[];
	/** Their lighting setups. */
	lightingSetups: readonly LightingSetup[];
};

export type TypeEditPlan = {
	/** The take patch to apply: Main written as no value, a change that changes nothing dropped. */
	take: Patch;
	/** Switches turned on, per table. Never one turned off. */
	slate: Patch;
	lightingSetup: Patch;
	/** The same switches, for the notice. */
	on: SwitchRef[];
	/** Switches on after the edit that no take holds the type of any more, in the order met. */
	left: SwitchRef[];
};

const refKey = (r: SwitchRef) => `${r.scope}:${r.id}:${r.key}`;

/** What a take patch does to the switches: the switches its new types turn on, and those its old types leave on alone. */
export function planTypeEdit(input: TypeEditInput): TypeEditPlan {
	const take: Change[] = [];
	for (const c of input.patch) {
		if (c.key !== 'takeType') take.push(c);
		else {
			const to = storedTakeType(c.to as string | undefined);
			if (to !== c.from) take.push({ ...c, to });
		}
	}

	const takes = new Map(input.takes.map((t) => [t.id, t]));
	const slates = new Map(input.slates.map((s) => [s.id, s]));
	const lights = new Map(input.lightingSetups.map((l) => [l.id, l]));

	/** The switches a type holds on the slate and lighting setup of one take. */
	const refsOf = (type: TakeType, slateId: string): SwitchRef[] =>
		(TYPE_SWITCHES[type] ?? []).flatMap((s): SwitchRef[] => {
			if (s.scope === 'slate') return slates.has(slateId) ? [{ ...s, id: slateId }] : [];
			const id = slates.get(slateId)?.lightingSetupId;
			return id && lights.has(id) ? [{ ...s, id }] : [];
		});

	const turnOn = new Map<string, SwitchRef>();
	const leaving = new Map<string, SwitchRef>();
	for (const c of take) {
		const t = takes.get(c.id);
		if (c.key !== 'takeType' || !t) continue;
		const before = takeTypeOf({ takeType: c.from as string | undefined });
		const after = takeTypeOf({ takeType: c.to as string | undefined });
		if (before === after) continue;
		for (const r of refsOf(after, t.slateId)) turnOn.set(refKey(r), r);
		for (const r of refsOf(before, t.slateId)) leaving.set(refKey(r), r);
	}

	const isOn = (r: SwitchRef, slateList: Map<string, Slate>, lightList: Map<string, LightingSetup>) =>
		(r.scope === 'slate' ? slateList.get(r.id)?.[r.key] : lightList.get(r.id)?.[r.key]) === true;
	const on = [...turnOn.values()].filter((r) => !isOn(r, slates, lights));
	const slate = on.filter((r) => r.scope === 'slate').map((r) => change(slates.get(r.id)!, r.key, true));
	const lightingSetup = on.filter((r) => r.scope === 'lightingSetup').map((r) => change(lights.get(r.id)!, r.key, true));

	const takesAfter = applyPatch(input.takes, take);
	const slatesAfter = new Map(applyPatch(input.slates, slate).map((s) => [s.id, s]));
	const lightsAfter = new Map(applyPatch(input.lightingSetups, lightingSetup).map((l) => [l.id, l]));
	/** Some take after the edit holds the switch: its type turns it on, on that record. */
	const held = (r: SwitchRef) =>
		takesAfter.some((t) => {
			if (!(TYPE_SWITCHES[takeTypeOf(t)] ?? []).some((s) => s.scope === r.scope && s.key === r.key)) return false;
			return r.scope === 'slate' ? t.slateId === r.id : slatesAfter.get(t.slateId)?.lightingSetupId === r.id;
		});
	const left = [...leaving.values()].filter((r) => isOn(r, slatesAfter, lightsAfter) && !held(r));

	return { take, slate, lightingSetup, on, left };
}

/** Turns off the switches given that are still on, per table. */
export function turnOffPatch(refs: readonly SwitchRef[], slates: readonly Slate[], lightingSetups: readonly LightingSetup[]): { slate: Patch; lightingSetup: Patch } {
	const slate: Change[] = [];
	const lightingSetup: Change[] = [];
	for (const r of refs) {
		if (r.scope === 'slate') {
			const s = slates.find((x) => x.id === r.id);
			if (s?.[r.key] === true) slate.push(change(s, r.key, undefined));
		} else {
			const l = lightingSetups.find((x) => x.id === r.id);
			if (l?.[r.key] === true) lightingSetup.push(change(l, r.key, undefined));
		}
	}
	return { slate, lightingSetup };
}
