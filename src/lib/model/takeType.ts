// The take type: what a take is for. No value is Main. Two types file the take with what its slate
// and lighting setup record: a clean plate turns on the slate's Clean plate, balls and chart turn on
// the lighting setup's Grey and chrome balls and Colour chart. The app turns a switch on, never off.
// A switch still on when no take holds its type any more is offered to turn off.
//
// A set reference follows the same rule (#93): an HDRI 360 turns on the lighting setup's HDRI, a
// witness camera clip the slate's Witness camera, a lidar scan the slate's Lidar scan. Removing the
// last one offers the switch to turn off. Pure.

import { FIELDS } from './catalogue';
import { applyPatch, change, type Change, type Patch } from './patch';
import type { LightingSetup, Reference, Slate, Take } from './types';

type TakeTypeDef = Extract<(typeof FIELDS)[number], { scope: 'take'; key: 'takeType' }>;

/** Every type, Main first, as the catalogue lists them. */
export const TAKE_TYPES: TakeTypeDef['options'] = FIELDS.find((d): d is TakeTypeDef => d.scope === 'take' && d.key === 'takeType')!.options;
export type TakeType = TakeTypeDef['options'][number];

/** One yes-or-no field a take type or a kind of set reference turns on. */
export type SwitchKey = { scope: 'slate'; key: 'cleanPlate' | 'witnessCamera' | 'lidar' } | { scope: 'lightingSetup'; key: 'referenceBalls' | 'colourChart' | 'hdri' };
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

/**
 * The switches each kind of set reference turns on, by the kind's key (lib/references/kinds.ts).
 * The other kinds, and a project's own, turn on nothing.
 */
export const KIND_SWITCHES: Readonly<Record<string, readonly SwitchKey[]>> = {
	hdri360: [{ scope: 'lightingSetup', key: 'hdri' }],
	witnessCamera: [{ scope: 'slate', key: 'witnessCamera' }],
	lidarScan: [{ scope: 'slate', key: 'lidar' }]
};

/** The switches a reference of `kind` turns on. */
const kindSwitches = (kind: string | undefined): readonly SwitchKey[] => (kind && Object.hasOwn(KIND_SWITCHES, kind) ? KIND_SWITCHES[kind] : []);

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

export type ReferenceEditInput = {
	/** Before the edit: every reference of the slates it touches, and of every slate on their lighting setups. */
	before: readonly Reference[];
	/** The same after it: a reference added, one gone, one of another kind. */
	after: readonly Reference[];
	/** The takes of those slates: a take holds a switch its type turns on. */
	takes: readonly Take[];
	slates: readonly Slate[];
	lightingSetups: readonly LightingSetup[];
};

export type SwitchPlan = Omit<TypeEditPlan, 'take'>;

/**
 * What an edit of set references does to the switches: the switches the kinds added turn on, and
 * those the kinds gone leave on with nothing to hold them. A reference holds its kind's switch on
 * its slate, or on its slate's lighting setup; a take holds its type's. Never one turned off.
 */
export function planReferenceEdit(input: ReferenceEditInput): SwitchPlan {
	const slates = new Map(input.slates.map((s) => [s.id, s]));
	const lights = new Map(input.lightingSetups.map((l) => [l.id, l]));
	const where = (s: SwitchKey, slateId: string): SwitchRef[] => {
		if (s.scope === 'slate') return slates.has(slateId) ? [{ ...s, id: slateId }] : [];
		const id = slates.get(slateId)?.lightingSetupId;
		return id && lights.has(id) ? [{ ...s, id }] : [];
	};
	const refsOf = (r: Reference) => kindSwitches(r.kind).flatMap((s) => where(s, r.slateId));

	const before = new Map(input.before.map((r) => [r.id, r]));
	const after = new Map(input.after.map((r) => [r.id, r]));
	/** The same reference, holding the same switches. */
	const same = (a: Reference | undefined, b: Reference) => a !== undefined && a.kind === b.kind && a.slateId === b.slateId;
	const turnOn = new Map<string, SwitchRef>();
	const leaving = new Map<string, SwitchRef>();
	for (const r of input.after) {
		if (same(before.get(r.id), r)) continue;
		for (const s of refsOf(r)) turnOn.set(refKey(s), s);
	}
	for (const r of input.before) {
		if (same(after.get(r.id), r)) continue;
		for (const s of refsOf(r)) leaving.set(refKey(s), s);
	}

	const isOn = (r: SwitchRef, slateList: Map<string, Slate>, lightList: Map<string, LightingSetup>) =>
		(r.scope === 'slate' ? slateList.get(r.id)?.[r.key] : lightList.get(r.id)?.[r.key]) === true;
	const on = [...turnOn.values()].filter((r) => !isOn(r, slates, lights));
	const slate = on.filter((r) => r.scope === 'slate').map((r) => change(slates.get(r.id)!, r.key, true));
	const lightingSetup = on.filter((r) => r.scope === 'lightingSetup').map((r) => change(lights.get(r.id)!, r.key, true));

	const slatesAfter = new Map(applyPatch(input.slates, slate).map((s) => [s.id, s]));
	const lightsAfter = new Map(applyPatch(input.lightingSetups, lightingSetup).map((l) => [l.id, l]));
	/** Some reference after the edit, or some take, holds the switch on that record. */
	const holds = (switches: readonly SwitchKey[], slateId: string, r: SwitchRef) =>
		switches.some((s) => s.scope === r.scope && s.key === r.key) && (r.scope === 'slate' ? slateId === r.id : slatesAfter.get(slateId)?.lightingSetupId === r.id);
	const held = (r: SwitchRef) =>
		input.after.some((x) => holds(kindSwitches(x.kind), x.slateId, r)) || input.takes.some((t) => holds(TYPE_SWITCHES[takeTypeOf(t)] ?? [], t.slateId, r));
	const left = [...leaving.values()].filter((r) => isOn(r, slatesAfter, lightsAfter) && !held(r));

	return { slate, lightingSetup, on, left };
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
