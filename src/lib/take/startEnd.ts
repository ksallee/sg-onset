// What the Start / End button does, as data the page hands to the editor. One press acts on every
// camera of one take number. Pure: the press instant and new ids come in.
//
// - A take number is running: End stamps the end time on each of its cameras still running.
// - Else the take on screen is ready: Start stamps the start time on each of its cameras.
// - Else (it ended, or the slate has no take): the next take number is made on every active
//   camera, as a copy of that camera's last take, and started.

import { change, type Patch } from '$lib/model/patch';
import { nextTake, nextTakeNumber } from '$lib/model/take';
import type { CameraSetup, Take } from '$lib/model/types';
import { NO_SETUP, type TakeGroup } from './groups';
import { groupPhase, runningGroup, stamp } from './phase';

export type StartEndPlan =
	| { kind: 'start'; number: string; patch: Patch }
	| { kind: 'end'; number: string; patch: Patch }
	| { kind: 'startNext'; number: string; creates: Take[] };

/** The take on screen: the one picked, else the one running, else the last. */
export function shownGroup(groups: readonly TakeGroup[], selected?: string): TakeGroup | undefined {
	return groups.find((g) => g.number === selected) ?? runningGroup(groups) ?? groups[groups.length - 1];
}

/** What the next press does, and to which take number: the button's words. */
export function pressTarget(groups: readonly TakeGroup[], selected?: string): { action: 'start' | 'end'; number: string } {
	const running = runningGroup(groups);
	if (running) return { action: 'end', number: running.number };
	const shown = shownGroup(groups, selected);
	if (shown && groupPhase(shown) === 'idle') return { action: 'start', number: shown.number };
	return { action: 'start', number: nextNumber(groups) };
}

function nextNumber(groups: readonly TakeGroup[]): string {
	const last = groups[groups.length - 1];
	return last ? nextTakeNumber(last.number) : '1';
}

const compact = (take: Record<string, unknown>) => Object.fromEntries(Object.entries(take).filter(([, v]) => v !== undefined)) as Take;

/** The last take of a camera on the slate, newest first. */
function lastOf(groups: readonly TakeGroup[], setupId: string): Take | undefined {
	for (let i = groups.length - 1; i >= 0; i--) if (groups[i].bySetup[setupId]) return groups[i].bySetup[setupId];
	return undefined;
}

/**
 * A camera's take with number `number`: a copy of its last take (`nextTake`: what belongs to one
 * take is left out), or a new one. The body and the lens come from the setup when it names them:
 * the setup is where a lens swap is made (model decision 2).
 */
function cameraTake(groups: readonly TakeGroup[], setupId: string, setups: readonly CameraSetup[], slateId: string, number: string, id: string): Take {
	const last = lastOf(groups, setupId);
	const setup = setups.find((s) => s.id === setupId);
	const base: Record<string, unknown> = last ? { ...nextTake(last, id) } : { id, slateId };
	return compact({
		...base,
		slateId,
		take: number,
		cameraSetupId: setupId === NO_SETUP ? undefined : setupId,
		cameraId: setup?.cameraId ?? base.cameraId,
		lensId: setup?.lensId ?? base.lensId
	});
}

/** New take: the next take number on every active camera, not started. */
export function nextTakes(input: { groups: readonly TakeGroup[]; active: readonly string[]; setups: readonly CameraSetup[]; slateId: string; newId: () => string }): Take[] {
	const number = nextNumber(input.groups);
	return input.active.map((setupId) => cameraTake(input.groups, setupId, input.setups, input.slateId, number, input.newId()));
}

/** A camera put on a take number after the fact. It shares the take's times: it ran with the others. */
export function addCameraTake(input: { groups: readonly TakeGroup[]; number: string; setupId: string; setups: readonly CameraSetup[]; slateId: string; id: string }): Take {
	const group = input.groups.find((g) => g.number === input.number);
	const take = cameraTake(input.groups, input.setupId, input.setups, input.slateId, input.number, input.id);
	const timed = group?.takes.find((t) => t.startedAt !== undefined);
	return compact({ ...take, startedAt: timed?.startedAt, endedAt: timed && groupPhase(group!) === 'filed' ? timed.endedAt : undefined });
}

/** The press at `at` (epoch ms, the instant the finger landed). */
export function startEndPlan(input: {
	groups: readonly TakeGroup[];
	selected?: string;
	active: readonly string[];
	setups: readonly CameraSetup[];
	slateId: string;
	at: number;
	newId: () => string;
}): StartEndPlan {
	const now = stamp(input.at);
	const running = runningGroup(input.groups);
	if (running) {
		const patch = running.takes
			.filter((t) => t.startedAt !== undefined && t.endedAt === undefined)
			.map((t) => change(t, 'endedAt', now < t.startedAt! ? t.startedAt : now));
		return { kind: 'end', number: running.number, patch };
	}
	const shown = shownGroup(input.groups, input.selected);
	if (shown && groupPhase(shown) === 'idle') return { kind: 'start', number: shown.number, patch: shown.takes.map((t) => change(t, 'startedAt', now)) };
	const creates = nextTakes(input).map((t) => ({ ...t, startedAt: now }));
	return { kind: 'startNext', number: creates[0]?.take ?? '1', creates };
}
