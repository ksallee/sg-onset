// Avid Log Exchange: one row per take for editorial. A Heading block (FIELD_DELIM TABS,
// VIDEO_FORMAT, FPS), the Column line, then Data, all tab-separated, as the ARRI, Avid and
// Silverstack files in research/ontologies. End is the frame after the last one: Start + Duration.
// Column names reuse the catalogue's ALE names (Avid first, then Silverstack, then ARRI); the lens
// and position columns are ours. Pure.

import type { UnitSystem } from '$lib/model/length';
import { formatRational, type Rational } from '$lib/model/rational';
import { lengthNumber, trimNumber } from './format';
import type { FlatTake } from './selection';
import { formatTimecode, isDropFrameRate, parseTimecode, timecodeBase } from './timecode';

export const ALE_COLUMNS = [
	'Name',
	'Tracks',
	'Start',
	'End',
	'Duration',
	'Tape',
	'Scene',
	'Take',
	'Camera',
	'Camroll',
	'Shoot Date',
	'FPS',
	'Circled Take',
	'Slate',
	'Description',
	'Comments',
	'VFX Shots',
	'Lens',
	'Lens_sn',
	'Focal Length',
	'Focal Length End',
	'T-Stop',
	'Focus Distance',
	'Focus Distance End',
	'Lens Height',
	'Lens Height End',
	'Tilt',
	'Tilt End',
	'Dutch',
	'Dutch End',
	'Sensor Fps',
	'Shutter_angle',
	'ASA',
	'Whitepoint',
	'Filter'
] as const;

export type AleOptions = {
	/** The timecode rate, written as FPS. Default: the commonest frame rate of the takes. */
	fps?: Rational;
	/** VIDEO_FORMAT. Default 1080. */
	videoFormat?: string;
	/** Drop frame timecode, with ; before the frames. Only at 29.97 and 59.94. */
	dropFrame?: boolean;
	/** A take without timecode: left out (default), or kept with Start and End empty. */
	withoutTimecode?: 'skip' | 'keep';
	/** Lengths as metres (default) or decimal feet. */
	lengths?: UnitSystem;
};

export type AleWarning =
	/** No rate given and no take has one: FPS is 24. */
	| { kind: 'noFps' }
	/** Drop frame was asked for at a rate that has none. Written non drop. */
	| { kind: 'noDropFrame' }
	/** Takes without timecode in or out. */
	| { kind: 'noTimecode'; takeIds: string[] }
	/** Takes whose timecode does not read at the rate, or ends before it starts. Left out. */
	| { kind: 'badTimecode'; takeIds: string[] };

export type AleResult = { text: string; skipped: string[]; warnings: AleWarning[] };

/** The commonest capture rate, ties to the first seen. */
function commonestRate(rows: readonly FlatTake[]): Rational | undefined {
	const counts = new Map<string, { rate: Rational; n: number }>();
	for (const { take } of rows) {
		const r = take.captureFrameRate;
		if (!r) continue;
		const key = `${r.num}/${r.denom}`;
		counts.set(key, { rate: r, n: (counts.get(key)?.n ?? 0) + 1 });
	}
	let best: { rate: Rational; n: number } | undefined;
	for (const c of counts.values()) if (!best || c.n > best.n) best = c;
	return best?.rate;
}

/** A value on one line: a tab or line break inside would split the row. */
function clean(value: string | undefined): string {
	return (value ?? '').replace(/[\t\r\n\v]+/g, ' ').trim();
}

const num = (n: number | undefined) => (n === undefined ? '' : trimNumber(n));

/** Start and end, the end repeating the start when the value did not change. */
function pair<T>(start: T | undefined, end: T | undefined, show: (v: T) => string): [string, string] {
	if (start === undefined) return ['', end === undefined ? '' : show(end)];
	return [show(start), show(end ?? start)];
}

export function exportAle(rows: readonly FlatTake[], options: AleOptions): AleResult {
	const warnings: AleWarning[] = [];
	let fps = options.fps ?? commonestRate(rows);
	if (!fps) {
		fps = { num: 24, denom: 1 };
		warnings.push({ kind: 'noFps' });
	}
	const dropFrame = !!options.dropFrame && isDropFrameRate(fps);
	if (options.dropFrame && !dropFrame) warnings.push({ kind: 'noDropFrame' });
	const base = timecodeBase(fps);
	const fpsText = formatRational(fps);
	const lengths = options.lengths ?? 'metric';
	const length = (l: { m: number | 'inf' }) => lengthNumber(l.m, lengths);

	const noTimecode: string[] = [];
	const badTimecode: string[] = [];
	const data: string[] = [];
	for (const row of rows) {
		const { take, slate, shootDay, lens } = row;
		let start = '';
		let end = '';
		let duration = '';
		if (take.timecodeStart && take.timecodeEnd) {
			const first = parseTimecode(take.timecodeStart, base, dropFrame);
			const last = parseTimecode(take.timecodeEnd, base, dropFrame);
			if (first === null || last === null || last < first) {
				badTimecode.push(take.id);
				continue;
			}
			start = formatTimecode(first, base, dropFrame);
			end = formatTimecode(last + 1, base, dropFrame);
			duration = formatTimecode(last + 1 - first, base, dropFrame);
		} else {
			noTimecode.push(take.id);
			if (options.withoutTimecode !== 'keep') continue;
		}
		const name = take.clipName ? clean(take.clipName) : [slate.slateUID, take.take, row.cameraLetter].map(clean).filter((x) => x !== '').join('-');
		const [focal, focalEnd] = row.focalLength ? [num(row.focalLength.start), num(row.focalLength.end)] : ['', ''];
		const [focus, focusEnd] = pair(take.focusDistance, take.focusDistanceEnd, length);
		const [height, heightEnd] = pair(take.lensHeight, take.lensHeightEnd, length);
		const [tilt, tiltEnd] = pair(take.tilt, take.tiltEnd, trimNumber);
		const [dutch, dutchEnd] = pair(take.roll, take.rollEnd, trimNumber);
		const values: Record<(typeof ALE_COLUMNS)[number], string> = {
			Name: name,
			Tracks: 'V',
			Start: start,
			End: end,
			Duration: duration,
			Tape: clean(take.clipName),
			Scene: clean(slate.sceneNumber),
			Take: clean(take.take),
			Camera: clean(row.cameraLetter),
			Camroll: clean(take.cameraRoll),
			'Shoot Date': (shootDay.shootDate ?? '').replace(/-/g, ''),
			FPS: fpsText,
			'Circled Take': take.circleTake ? 'Yes' : '',
			Slate: clean(slate.slateUID),
			Description: clean(slate.description),
			Comments: clean(take.notes),
			'VFX Shots': clean(slate.vfxShots?.join(', ')),
			Lens: clean(lens?.lensModel),
			Lens_sn: clean(lens?.lensSerialNumber),
			'Focal Length': focal,
			'Focal Length End': focalEnd,
			'T-Stop': num(take.tStop),
			'Focus Distance': focus,
			'Focus Distance End': focusEnd,
			'Lens Height': height,
			'Lens Height End': heightEnd,
			Tilt: tilt,
			'Tilt End': tiltEnd,
			Dutch: dutch,
			'Dutch End': dutchEnd,
			'Sensor Fps': take.captureFrameRate ? formatRational(take.captureFrameRate) : '',
			Shutter_angle: num(take.shutterAngle),
			ASA: num(take.isoSpeed),
			Whitepoint: num(take.whiteBalance),
			Filter: clean(take.filter)
		};
		data.push(ALE_COLUMNS.map((c) => values[c]).join('\t'));
	}
	if (noTimecode.length) warnings.push({ kind: 'noTimecode', takeIds: noTimecode });
	if (badTimecode.length) warnings.push({ kind: 'badTimecode', takeIds: badTimecode });
	const skipped = [...(options.withoutTimecode === 'keep' ? [] : noTimecode), ...badTimecode];

	const lines = [
		'Heading',
		'FIELD_DELIM\tTABS',
		`VIDEO_FORMAT\t${clean(options.videoFormat) || '1080'}`,
		`FPS\t${fpsText}`,
		'',
		'Column',
		ALE_COLUMNS.join('\t'),
		'',
		'Data',
		...data
	];
	return { text: lines.join('\n') + '\n', skipped, warnings };
}
