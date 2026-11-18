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
 * longer there, then NO_SETUP when a take has none. With `shooting`, the setups this device shoots
 * with (#110): another setup has a column only when a take of these groups is on it.
 */
export function cameraColumns(setups: readonly CameraSetup[], groups: readonly TakeGroup[], shooting?: ReadonlySet<string>): Column[] {
	const onTakes = new Set(groups.flatMap((g) => Object.keys(g.bySetup)));
	const shown = shooting ? setups.filter((s) => shooting.has(s.id) || onTakes.has(s.id)) : setups;
	const columns: Column[] = [...shown]
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
 * project, else one take with no setup. With `shooting` (#110), only setups this device shoots
 * with: those of the last take still chosen, else every chosen one. A setup since deleted, and no
 * setup, carry as before.
 */
export function activeSetupIds(groups: readonly TakeGroup[], setups: readonly CameraSetup[], shooting?: ReadonlySet<string>): string[] {
	const last = groups[groups.length - 1];
	const columns = cameraColumns(setups, last ? [last] : [], shooting);
	const chosen = (c: Column) => !shooting || !c.setup || shooting.has(c.id);
	const onLast = last ? columns.filter((c) => c.id in last.bySetup && chosen(c)).map((c) => c.id) : [];
	const every = columns.filter((c) => c.setup && chosen(c)).map((c) => c.id);
	const ids = onLast.length ? onLast : every;
	return ids.length ? ids : [NO_SETUP];
}
