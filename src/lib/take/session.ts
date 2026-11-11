// The take screen's state and every change to it. Pure: the clock and new ids come in.
import { copyOfLast, nextTakeNumber } from './numbering';
import { phaseOf, pressRecord } from './record';
import { pushRecent } from './recent';
import type { FieldKey, SetupId, Still, Take } from './types';

export interface Session {
	/** In list order: slates together, takes in the order shot. */
	takes: Take[];
	/** The take on screen. */
	currentId: string;
	recents: Record<FieldKey, number[]>;
}

export const currentTake = (s: Session): Take => s.takes.find((t) => t.id === s.currentId) ?? s.takes[0];
export const rollingTake = (s: Session): Take | undefined => s.takes.find((t) => phaseOf(t) === 'rolling');

const replace = (s: Session, take: Take): Session => ({ ...s, takes: s.takes.map((t) => (t.id === take.id ? take : t)) });

/** The last take of the slate of `take`, and where it sits. */
function lastOfSlate(s: Session, take: Take): number {
	let at = -1;
	s.takes.forEach((t, i) => {
		if (t.slate === take.slate && t.scene === take.scene) at = i;
	});
	return at;
}

function append(s: Session, id: string): { session: Session; take: Take } {
	const at = lastOfSlate(s, currentTake(s));
	const take = copyOfLast(s.takes[at], id);
	return { session: { ...s, takes: [...s.takes.slice(0, at + 1), take, ...s.takes.slice(at + 1)], currentId: id }, take };
}

/**
 * The Record press. A take is rolling: it ends and is filed, and comes on screen. Else the
 * current take rolls; if it is filed already, a new take (a copy of the slate's last) rolls.
 */
export function record(s: Session, now: number, newId: string): Session {
	const rolling = rollingTake(s);
	if (rolling) return { ...replace(s, pressRecord(rolling, now)), currentId: rolling.id };
	const current = currentTake(s);
	if (phaseOf(current) === 'idle') return replace(s, pressRecord(current, now));
	const { session, take } = append(s, newId);
	return replace(session, pressRecord(take, now));
}

/** What the next Record press does, and to which take number: shown under the button. */
export function recordTarget(s: Session): { action: 'roll' | 'cut' | 'rollNew'; take: string } {
	const rolling = rollingTake(s);
	if (rolling) return { action: 'cut', take: rolling.take };
	const current = currentTake(s);
	if (phaseOf(current) === 'idle') return { action: 'roll', take: current.take };
	return { action: 'rollNew', take: nextTakeNumber(s.takes[lastOfSlate(s, current)].take) };
}

/** A new take, not rolled, to set up before the roll. Not while a take rolls. */
export function newTake(s: Session, newId: string): Session {
	if (rollingTake(s)) return s;
	return append(s, newId).session;
}

export function select(s: Session, id: string): Session {
	return s.takes.some((t) => t.id === id) ? { ...s, currentId: id } : s;
}

export function setValue(s: Session, setup: SetupId, field: FieldKey, value: number | null): Session {
	const take = currentTake(s);
	const next = replace(s, { ...take, cameras: { ...take.cameras, [setup]: { ...take.cameras[setup], [field]: value } } });
	if (value === null) return next;
	return { ...next, recents: { ...s.recents, [field]: pushRecent(s.recents[field], value) } };
}

export function addStill(s: Session, still: Still): Session {
	const take = currentTake(s);
	return replace(s, { ...take, stills: [...take.stills, still] });
}

/** The take before `take` in its slate: what it was copied from. */
export function previousTake(s: Session, take: Take): Take | undefined {
	const same = s.takes.filter((t) => t.slate === take.slate && t.scene === take.scene);
	return same[same.findIndex((t) => t.id === take.id) - 1];
}

const FIELD_ORDER: FieldKey[] = ['focalLength', 'focusDistance', 'tStop', 'cameraHeight', 'tilt'];

/** The fields of one camera that differ from the take before. */
export function changedFrom(take: Take, before: Take | undefined, setup: SetupId): FieldKey[] {
	if (!before) return [];
	return FIELD_ORDER.filter((f) => take.cameras[setup][f] !== before.cameras[setup][f]);
}

/** The takes in list order, grouped by slate. */
export function groupBySlate(takes: readonly Take[]): { scene: string; slate: string; takes: Take[] }[] {
	const groups: { scene: string; slate: string; takes: Take[] }[] = [];
	for (const take of takes) {
		const last = groups[groups.length - 1];
		if (last && last.slate === take.slate && last.scene === take.scene) last.takes.push(take);
		else groups.push({ scene: take.scene, slate: take.slate, takes: [take] });
	}
	return groups;
}
