// Which column of the DIT's file holds what: the clip name, the camera roll, the camera letter,
// the timecode in and out, the duration and the timecode rate; then the lens, the focal length,
// the T-stop, ISO, white balance, shutter angle and frame rate. Known by name: the ALE names the
// catalogue lists (Avid, ARRI, Silverstack) and the usual CSV ones, compared without case, spaces
// or punctuation, and without a unit at the end. A column the names miss is picked by the person.
// Pure.

/** What a column can be read as. Camera, duration and timecode rate help read the rest. */
export const COLUMN_TARGETS = [
	'clipName',
	'cameraRoll',
	'camera',
	'timecodeStart',
	'timecodeEnd',
	'duration',
	'fps',
	'lens',
	'focalLength',
	'tStop',
	'isoSpeed',
	'whiteBalance',
	'shutterAngle',
	'captureFrameRate'
] as const;
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
	fps: ['fps', 'projectfps', 'timecoderate', 'tcfps', 'timecodefps'],
	lens: ['lenstype', 'lens', 'lensmodel', 'lensname', 'lensid'],
	focalLength: ['focallength', 'lensfocallength', 'focal', 'fl'],
	tStop: ['fstop', 'tstop', 'stop', 'iris', 'lensiris', 'aperture'],
	isoSpeed: ['exposureindex', 'asa', 'iso', 'isospeed', 'isosensitivity', 'ei'],
	whiteBalance: ['whitebalance', 'whitepoint', 'wb', 'kelvin', 'colortemperature', 'colourtemperature'],
	shutterAngle: ['shutterangle', 'shutter', 'shutterdeg', 'shutterspeedangle'],
	captureFrameRate: ['sensorfps', 'capturefps', 'captureframerate', 'capturerate', 'framerate', 'cameraframerate']
};

/** A unit a header may end with: "Focal length (mm)", "White balance K". */
const UNIT = /(mm|fps|deg|k)$/;

/** The names a squashed header may be known by: itself, then without a unit at the end. */
function namesOf(name: string): string[] {
	const bare = name.replace(UNIT, '');
	return bare !== name && bare !== '' ? [name, bare] : [name];
}

/** A header as compared: lower case letters and digits. */
export function squash(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** What a header is read as by its name alone. */
export function knownTarget(header: string): ColumnTarget | undefined {
	const names = namesOf(squash(header));
	if (names[0] === '') return undefined;
	for (const name of names) {
		const target = COLUMN_TARGETS.find((t) => COLUMN_NAMES[t].includes(name));
		if (target) return target;
	}
	return undefined;
}

/** The columns known by name. Each column is read as one target at most. */
export function autoMap(headers: readonly string[]): ColumnMap {
	const names = headers.map((h) => namesOf(squash(h)));
	const map: ColumnMap = {};
	const used = new Set<number>();
	for (const target of COLUMN_TARGETS) {
		for (const name of COLUMN_NAMES[target]) {
			const index = names.findIndex((n, i) => n.includes(name) && !used.has(i));
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
