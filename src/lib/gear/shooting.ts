// The camera setups this device shoots with (Kevin, #110). Every device of a show sees every setup
// in Gear, as it is read back from Flow PT; each device chooses the ones it shoots with, and the
// take screen and Start use only those. Wrap, the exports and Flow PT keep every take. The choice
// is kept on the device, per project, and never synced. By default a device shoots with the setups
// made on it: a setup read back from another device starts unchosen. So what is kept is the setups
// it does not shoot with. Pure; `shooting.svelte.ts` stores it.

import type { CameraSetup } from '$lib/model/types';

export const SHOOTING_KEY = 'sg-onset.shooting';

/** By project id: the setups this device does not shoot with. */
export type Shooting = Readonly<Record<string, readonly string[]>>;

/** Whether this device shoots with a setup. */
export function shootsWith(shooting: Shooting, projectId: string, setupId: string): boolean {
	return !(shooting[projectId] ?? []).includes(setupId);
}

/** The choice after turning a setup on or off on this device. */
export function setShooting(shooting: Shooting, projectId: string, setupId: string, on: boolean): Shooting {
	const off = (shooting[projectId] ?? []).filter((id) => id !== setupId);
	return { ...shooting, [projectId]: on ? off : [...off, setupId] };
}

/** The choice after setups were read back from another device: they start unchosen here. */
export function leaveOff(shooting: Shooting, projectId: string, setupIds: readonly string[]): Shooting {
	const off = shooting[projectId] ?? [];
	const added = setupIds.filter((id, i) => !off.includes(id) && setupIds.indexOf(id) === i);
	return added.length ? { ...shooting, [projectId]: [...off, ...added] } : shooting;
}

/** The ids of the project's setups this device shoots with. */
export function chosenSetups(setups: readonly CameraSetup[], shooting: Shooting, projectId: string): Set<string> {
	return new Set(setups.filter((s) => s.projectId === projectId && shootsWith(shooting, projectId, s.id)).map((s) => s.id));
}

/** What was stored. Anything unreadable is left out: the device then shoots with every setup. */
export function parseShooting(raw: string | null | undefined): Shooting {
	let value: unknown;
	try {
		value = raw ? JSON.parse(raw) : null;
	} catch {
		return {};
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
	const out: Record<string, string[]> = {};
	for (const [projectId, ids] of Object.entries(value)) {
		if (!Array.isArray(ids)) continue;
		out[projectId] = ids.filter((id): id is string => typeof id === 'string' && id !== '');
	}
	return out;
}

export function serializeShooting(shooting: Shooting): string {
	return JSON.stringify(shooting);
}
