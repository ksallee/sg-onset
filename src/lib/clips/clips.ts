// The clips of the DIT's file, read through the column map: the name without its file extension,
// the camera roll, the camera letter (from its column, else the roll, else the name), the
// timecode in and the last frame. What could not be read is reported, never thrown. Pure.

import { formatTimecode, isDropFrameRate, parseTimecode, timecodeBase } from '$lib/export/timecode';
import type { Rational } from '$lib/model/rational';
import type { ColumnMap, ColumnTarget } from './columns';
import type { Sheet, SheetRow } from './sheet';
import { guessRate, lastFrame, readRate, tidyTimecode } from './timecode';

export type Clip = {
	/** 1-based line or row in the file: the clip's id in an import. */
	row: number;
	name: string;
	roll?: string;
	camera?: string;
	/** Timecode at the first frame, HH:MM:SS:FF, with ; before the frames for drop frame. */
	start?: string;
	/** Timecode at the last frame, as the take's Timecode out holds it. */
	end?: string;
	/** The same as frame counts from 00:00:00:00, at the rate. */
	startFrame?: number;
	endFrame?: number;
	/** The timecode rate. */
	rate: Rational;
	dropFrame: boolean;
};

export type ClipIssue =
	/** No column is read as the clip name: nothing imports. */
	| { kind: 'noNameColumn' }
	/** The file names no timecode rate: read at `rate`, a guess from the frame numbers. */
	| { kind: 'noRate'; rate: Rational }
	/** A row with no clip name, left out. */
	| { kind: 'noName'; row: number }
	/** A timecode cell that is not timecode, left out. */
	| { kind: 'badTimecode'; row: number; column: string; value: string };

export type ClipRead = { clips: Clip[]; issues: ClipIssue[] };

/** File extensions of camera media: Avid and a few CSVs keep them on the name. */
const MEDIA = /\.(mov|mxf|mp4|m4v|r3d|braw|ari|arx|crm|mts|avi)$/i;

/** The clip name as cameras write it: trimmed, without a media file extension. */
export function clipNameOf(text: string): string {
	return text.trim().replace(MEDIA, '');
}

/** The camera letter a roll or clip name starts with: A001 is A, AA012 is AA. */
export function cameraOf(text: string | undefined): string | undefined {
	const m = /^([A-Za-z]+)\d/.exec(text?.trim() ?? '');
	return m ? m[1].toUpperCase() : undefined;
}

export function readClips(sheet: Sheet, map: ColumnMap): ClipRead {
	if (map.clipName === undefined) return { clips: [], issues: [{ kind: 'noNameColumn' }] };
	const cell = (row: SheetRow, target: ColumnTarget) => {
		const i = map[target];
		return i === undefined ? '' : (row.cells[i] ?? '').trim();
	};
	const header = (target: ColumnTarget) => sheet.headers[map[target]!] ?? '';

	const timecodes = sheet.rows.flatMap((row) => [cell(row, 'timecodeStart'), cell(row, 'timecodeEnd')]).filter((tc) => tidyTimecode(tc));
	const fileRate = readRate(sheet.heading.FPS);
	let guessed: Rational | undefined;

	const clips: Clip[] = [];
	const issues: ClipIssue[] = [];
	for (const row of sheet.rows) {
		const name = clipNameOf(cell(row, 'clipName'));
		if (name === '') {
			issues.push({ kind: 'noName', row: row.line });
			continue;
		}
		let rate = readRate(cell(row, 'fps')) ?? fileRate;
		if (!rate) rate = guessed ??= guessRate(timecodes);
		const base = timecodeBase(rate);
		const day = base * 86400;

		/** A timecode cell as a frame count, or undefined; a cell that is not timecode is reported. */
		const frames = (target: ColumnTarget): { frame: number; dropFrame: boolean } | undefined => {
			const text = cell(row, target);
			if (text === '') return undefined;
			const tc = tidyTimecode(text);
			const dropFrame = !!tc?.dropFrame && isDropFrameRate(rate);
			const frame = tc ? parseTimecode(tc.text, base, dropFrame) : null;
			if (frame === null) {
				if (target !== 'duration') issues.push({ kind: 'badTimecode', row: row.line, column: header(target), value: text });
				return undefined;
			}
			return { frame, dropFrame };
		};
		const start = frames('timecodeStart');
		const end = frames('timecodeEnd');
		const duration = frames('duration');
		const dropFrame = (start ?? end)?.dropFrame ?? false;
		const last = start ? lastFrame(start.frame, end?.frame, duration?.frame, day) : end ? (end.frame - 1 + day) % day : undefined;

		const roll = cell(row, 'cameraRoll') || undefined;
		const clip: Clip = { row: row.line, name, rate, dropFrame };
		if (roll) clip.roll = roll;
		const camera = cell(row, 'camera') || cameraOf(roll) || cameraOf(name);
		if (camera) clip.camera = camera;
		if (start) {
			clip.start = formatTimecode(start.frame, base, dropFrame);
			clip.startFrame = start.frame;
		}
		if (last !== undefined) {
			clip.end = formatTimecode(last, base, dropFrame);
			clip.endFrame = last;
		}
		clips.push(clip);
	}
	if (guessed && timecodes.length) issues.unshift({ kind: 'noRate', rate: guessed });
	return { clips, issues };
}
