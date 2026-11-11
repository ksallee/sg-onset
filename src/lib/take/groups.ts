// The takes of a slate as the take screen shows them. A take is one camera's take (model
// decision 1), so take 3 on A and take 3 on B are two records: here they are one row, a group,
// with a column per camera setup. Pure.

import { sortTakes } from '$lib/app/takeRows';
import type { CameraSetup, Take } from '$lib/model/types';

/** The column of takes that have no camera setup. */
export const NO_SETUP = '';

export interface TakeGroup {
	/** The take number, as typed: "3", "PU2". */
	number: string;
	/** Its takes, in the order shot. */
	takes: Take[];
	/** The take of each camera setup, by setup id; NO_SETUP for a take with none. */
	bySetup: Record<string, Take>;
}

export interface Column {
	/** The setup id, or NO_SETUP. */
	id: string;
	/** The camera letter. Empty for NO_SETUP and for a setup since deleted. */
	label: string;
	setup?: CameraSetup;
}

const collator = new Intl.Collator('en', { numeric: true });
const setupOf = (take: Take) => take.cameraSetupId ?? NO_SETUP;

/** The takes grouped by take number, in the order shot: by the first start, then by number. */
export function groupTakes(takes: readonly Take[]): TakeGroup[] {
	const groups = new Map<string, TakeGroup>();
	for (const take of sortTakes(takes)) {
		const number = take.take ?? '';
		let group = groups.get(number);
		if (!group) groups.set(number, (group = { number, takes: [], bySetup: {} }));
		group.takes.push(take);
		group.bySetup[setupOf(take)] ??= take;
	}
	return [...groups.values()];
}

/**
 * The columns: the project's camera setups by letter, then any setup a take points at that is no
 * longer there, then NO_SETUP when a take has none.
 */
export function cameraColumns(setups: readonly CameraSetup[], groups: readonly TakeGroup[]): Column[] {
	const columns: Column[] = [...setups]
		.sort((a, b) => collator.compare(a.cameraLabel ?? '', b.cameraLabel ?? ''))
		.map((setup) => ({ id: setup.id, label: setup.cameraLabel ?? '', setup }));
	const known = new Set(columns.map((c) => c.id));
	let none = false;
	for (const group of groups)
		for (const id of Object.keys(group.bySetup)) {
			if (id === NO_SETUP) none = true;
			else if (!known.has(id)) {
				known.add(id);
				columns.push({ id, label: '' });
			}
		}
	if (none) columns.push({ id: NO_SETUP, label: '' });
	return columns;
}

/**
 * The cameras a new take is made on: those on the last take of the slate, else every setup of the
 * project, else one take with no setup.
 */
export function activeSetupIds(groups: readonly TakeGroup[], setups: readonly CameraSetup[]): string[] {
	const last = groups[groups.length - 1];
	const columns = cameraColumns(setups, last ? [last] : []);
	const ids = last ? columns.filter((c) => c.id in last.bySetup).map((c) => c.id) : columns.map((c) => c.id);
	return ids.length ? ids : [NO_SETUP];
}
