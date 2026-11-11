// What an export reads: the records of one project as the store returns them, picked by shoot
// day, slate range and take flags, and flattened to one row per take (one camera's take) with the
// slate, shoot day, lighting setup, camera setup, camera and lens resolved onto it. Pure.

import type { Scope } from '$lib/model/catalogue';
import { effectiveFocalLength } from '$lib/model/take';
import type { Camera, CameraSetup, Lens, LightingSetup, Project, ShootDay, Slate, Still, Take } from '$lib/model/types';

/** The records of one project, as `Store.list` returns them. Any order. */
export type ExportInput = {
	project: Project;
	shootDays: ShootDay[];
	lightingSetups: LightingSetup[];
	cameraSetups: CameraSetup[];
	cameras: Camera[];
	lenses: Lens[];
	slates: Slate[];
	takes: Take[];
	stills: Still[];
};

export type ExportFilters = {
	/** Only these shoot days. Absent or empty: every day. */
	shootDayIds?: string[];
	/** Slates from this one, inclusive, in natural order: 9 before 10, 42A before 42B. */
	slateFrom?: string;
	/** Slates up to this one, inclusive. */
	slateTo?: string;
	/** Only circled takes. */
	circledOnly?: boolean;
	/** Leave out takes marked no good. */
	excludeNoGood?: boolean;
};

/** One camera's take, with everything above it. */
export type FlatTake = {
	project: Project;
	shootDay: ShootDay;
	slate: Slate;
	take: Take;
	lightingSetup?: LightingSetup;
	cameraSetup?: CameraSetup;
	/** The body the take holds. Not filled from the camera setup: the setup may have changed since. */
	camera?: Camera;
	/** The lens the take holds. Same rule. */
	lens?: Lens;
	/** A, B. Empty when the take has no camera setup. */
	cameraLetter: string;
	/** In mm. A prime's own focal length wins over the take's (model decision 30). */
	focalLength?: { start: number; end: number; source: 'lens' | 'take' };
	/** The take's photos, oldest first. */
	stills: Still[];
};

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** As a person counts: 9 before 10, 42A before 42B, case ignored. */
export function naturalCompare(a: string, b: string): number {
	return collator.compare(a, b);
}

/** Oldest first: by date, then day number, then id so the order never depends on the input. */
export function compareShootDays(a: ShootDay, b: ShootDay): number {
	return (a.shootDate ?? '').localeCompare(b.shootDate ?? '') || (a.shootDay ?? 0) - (b.shootDay ?? 0) || a.id.localeCompare(b.id);
}

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
	return new Map(rows.map((r) => [r.id, r]));
}

function inRange(slate: Slate, filters: ExportFilters): boolean {
	const uid = slate.slateUID ?? '';
	if (filters.slateFrom !== undefined && filters.slateFrom !== '' && naturalCompare(uid, filters.slateFrom) < 0) return false;
	if (filters.slateTo !== undefined && filters.slateTo !== '' && naturalCompare(uid, filters.slateTo) > 0) return false;
	return true;
}

/** The shoot days the filters keep, oldest first. */
export function selectShootDays(input: ExportInput, filters: ExportFilters = {}): ShootDay[] {
	const ids = filters.shootDayIds?.length ? new Set(filters.shootDayIds) : undefined;
	return input.shootDays.filter((d) => !ids || ids.has(d.id)).sort(compareShootDays);
}

/** The slates of the kept days in the slate range, in day then natural order. Take filters do not apply. */
export function selectSlates(input: ExportInput, filters: ExportFilters = {}): Slate[] {
	const days = selectShootDays(input, filters);
	const dayIndex = new Map(days.map((d, i) => [d.id, i]));
	return input.slates
		.filter((s) => dayIndex.has(s.shootDayId) && inRange(s, filters))
		.sort((a, b) => dayIndex.get(a.shootDayId)! - dayIndex.get(b.shootDayId)! || naturalCompare(a.slateUID ?? '', b.slateUID ?? '') || a.id.localeCompare(b.id));
}

/**
 * One row per take the filters keep. Order: shoot day, slate, take number, camera letter, all in
 * natural order. A take whose slate or shoot day is not in the input is left out.
 */
export function flatten(input: ExportInput, filters: ExportFilters = {}): FlatTake[] {
	const slates = selectSlates(input, filters);
	const slateIndex = new Map(slates.map((s, i) => [s.id, i]));
	const days = byId(input.shootDays);
	const lighting = byId(input.lightingSetups);
	const setups = byId(input.cameraSetups);
	const cameras = byId(input.cameras);
	const lenses = byId(input.lenses);
	const slateById = byId(slates);
	const stills = new Map<string, Still[]>();
	for (const still of input.stills) stills.set(still.takeId, [...(stills.get(still.takeId) ?? []), still]);

	const rows: FlatTake[] = [];
	for (const take of input.takes) {
		const slate = slateById.get(take.slateId);
		if (!slate) continue;
		if (filters.circledOnly && !take.circleTake) continue;
		if (filters.excludeNoGood && take.noGood) continue;
		const cameraSetup = take.cameraSetupId ? setups.get(take.cameraSetupId) : undefined;
		const lens = take.lensId ? lenses.get(take.lensId) : undefined;
		rows.push({
			project: input.project,
			shootDay: days.get(slate.shootDayId)!,
			slate,
			take,
			lightingSetup: slate.lightingSetupId ? lighting.get(slate.lightingSetupId) : undefined,
			cameraSetup,
			camera: take.cameraId ? cameras.get(take.cameraId) : undefined,
			lens,
			cameraLetter: cameraSetup?.cameraLabel ?? '',
			focalLength: effectiveFocalLength(take, lens),
			stills: (stills.get(take.id) ?? []).slice().sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id))
		});
	}
	return rows.sort(
		(a, b) =>
			slateIndex.get(a.slate.id)! - slateIndex.get(b.slate.id)! ||
			naturalCompare(a.take.take ?? '', b.take.take ?? '') ||
			naturalCompare(a.cameraLetter, b.cameraLetter) ||
			a.take.id.localeCompare(b.take.id)
	);
}

/** The record of `scope` on a row. */
export function rowRecord(row: FlatTake, scope: Scope): Record<string, unknown> | undefined {
	return row[scope] as Record<string, unknown> | undefined;
}

/** The stored value of `key` (an end key too) in `scope` on a row. */
export function rowValue(row: FlatTake, scope: Scope, key: string): unknown {
	return rowRecord(row, scope)?.[key];
}
