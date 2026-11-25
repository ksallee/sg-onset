// The rigs a camera can be on: the built-in ones, and the rigs a project adds in Settings (#138).
// A camera setup and a take keep the rig as text: a built-in key (`steadicam`), or a project rig
// as typed, as a set reference keeps its kind (lib/references/kinds.ts). Pure: labels come in from
// the message catalogue.

/** The built-in rigs, in the order Kevin listed them (2026-11-25). */
export const RIGS = [
	'handheld',
	'shoulderRig',
	'easyrig',
	'steadicam',
	'gimbal',
	'tripod',
	'hiHat',
	'dolly',
	'slider',
	'jib',
	'crane',
	'technocrane',
	'carMount',
	'cameraCar',
	'drone',
	'cableCam',
	'motionControl',
	'underwaterHousing'
] as const;
export type BuiltInRig = (typeof RIGS)[number];

export function isBuiltInRig(rig: string): rig is BuiltInRig {
	return (RIGS as readonly string[]).includes(rig);
}

const loose = (text: string) => text.trim().toLowerCase();

/**
 * The rigs to pick from: the built-in ones, then the project's own. A project rig is listed once,
 * as first typed, and never one that spells a built-in key.
 */
export function rigChoices(projectRigs: readonly string[]): string[] {
	const own: string[] = [];
	const seen = new Set<string>(RIGS.map(loose));
	for (const rig of projectRigs) {
		const name = rig.trim();
		if (name === '' || seen.has(loose(name))) continue;
		seen.add(loose(name));
		own.push(name);
	}
	return [...RIGS, ...own];
}

/** The message key of a built-in rig's label. A project rig has none: it shows as typed. */
export function rigLabelKey(rig: string): `gear.rig.${BuiltInRig}` | undefined {
	return isBuiltInRig(rig) ? `gear.rig.${rig}` : undefined;
}

/** A rig as shown. No rig shows as nothing. `label` reads a message key. */
export function rigLabel(rig: string | undefined, label: (key: string) => string): string {
	const r = (rig ?? '').trim();
	if (r === '') return '';
	const key = rigLabelKey(r);
	return key ? label(key) : r;
}

/**
 * Why `name` cannot be a new project rig: empty, or a rig already there (a built-in one by key or
 * label, or one of the project's), case and outer spaces ignored. Nothing when it can.
 * `builtInLabel` gives a built-in rig's label.
 */
export function rigProblem(name: string, projectRigs: readonly string[], builtInLabel: (rig: string) => string): 'empty' | 'taken' | undefined {
	const n = loose(name);
	if (n === '') return 'empty';
	const taken = [...RIGS, ...RIGS.map(builtInLabel), ...projectRigs].map(loose);
	return taken.includes(n) ? 'taken' : undefined;
}
