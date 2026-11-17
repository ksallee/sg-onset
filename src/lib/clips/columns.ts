// Which column of the DIT's file holds what: the clip name, the camera roll, the camera letter,
// the timecode in and out, the duration and the timecode rate. Known by name: the ALE names the
// catalogue lists (Avid, ARRI, Silverstack) and the usual CSV ones, compared without case, spaces
// or punctuation. A column the names miss is picked by the person. Pure.

/** What a column can be read as. The first four fill take fields; the rest help read them. */
export const COLUMN_TARGETS = ['clipName', 'cameraRoll', 'camera', 'timecodeStart', 'timecodeEnd', 'duration', 'fps'] as const;
export type ColumnTarget = (typeof COLUMN_TARGETS)[number];

/** Target to the index of its column in the header row. */
export type ColumnMap = Partial<Record<ColumnTarget, number>>;

/**
 * Names per target, squashed, the likeliest first: when a file has two, the first wins. The
 * catalogue's ALE names come first (`columns.test.ts` checks they are all here).
 */
export const COLUMN_NAMES: Record<ColumnTarget, readonly string[]> = {
	clipName: ['name', 'clipname', 'clip', 'filename', 'sourcefile'],
	cameraRoll: ['camroll', 'cameraroll', 'roll', 'reelname', 'reel', 'cardroll', 'card'],
	camera: ['camera', 'cameraindex', 'cameraletter', 'camletter', 'cameralabel', 'cam'],
	timecodeStart: ['start', 'starttc', 'tcstart', 'starttimecode', 'timecodestart', 'timecodein', 'tcin', 'in', 'sourcein', 'timecode', 'tc'],
	timecodeEnd: ['end', 'endtc', 'tcend', 'endtimecode', 'timecodeend', 'timecodeout', 'tcout', 'out', 'sourceout'],
	duration: ['duration', 'dur', 'clipduration', 'length'],
	fps: ['fps', 'projectfps', 'timecoderate', 'tcfps', 'timecodefps']
};

/** A header as compared: lower case letters and digits. */
export function squash(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** What a header is read as by its name alone. */
export function knownTarget(header: string): ColumnTarget | undefined {
	const name = squash(header);
	return name === '' ? undefined : COLUMN_TARGETS.find((target) => COLUMN_NAMES[target].includes(name));
}

/** The columns known by name. Each column is read as one target at most. */
export function autoMap(headers: readonly string[]): ColumnMap {
	const names = headers.map(squash);
	const map: ColumnMap = {};
	const used = new Set<number>();
	for (const target of COLUMN_TARGETS) {
		for (const name of COLUMN_NAMES[target]) {
			const index = names.findIndex((n, i) => n === name && !used.has(i));
			if (index >= 0) {
				map[target] = index;
				used.add(index);
				break;
			}
		}
	}
	return map;
}

/** Reads column `index` as `target`, or `target` from no column. A column read as another target leaves it. */
export function setColumn(map: ColumnMap, target: ColumnTarget, index: number | undefined): ColumnMap {
	const next: ColumnMap = {};
	for (const t of COLUMN_TARGETS) {
		if (t === target || map[t] === undefined || map[t] === index) continue;
		next[t] = map[t];
	}
	if (index !== undefined) next[target] = index;
	return next;
}
