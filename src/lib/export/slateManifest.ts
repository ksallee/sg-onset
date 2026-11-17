// The manifest of a slate's folder in the wrap package: a CSV, one row per take, per file and per
// set reference. A file's row repeats its take's clip, roll and timecode, so each file is linked
// to its clip on its own line. A reference's row has the empty folder that waits for it. Paths
// are from the package root, so a row can point into another slate's folder. Headers are fixed
// English, as CRIF's are, for scripts. Pure: the kind labels come in.

import { csvText } from './csvWrite';
import type { Media, SlateFolder } from './wrapPackage';

export const MANIFEST_COLUMNS = ['What', 'Take', 'Camera', 'Clip', 'Roll', 'Timecode in', 'Timecode out', 'Kind', 'Name', 'Path', 'Device', 'Card or roll', 'Count', 'Notes'] as const;

/** What a file's row says it is. A later kind of file (#86, #87) adds its word. A video is a Photo row (#94). */
const WHAT: Record<Media, string> = { photo: 'Photo', audio: 'Audio note' };

type Row = Partial<Record<(typeof MANIFEST_COLUMNS)[number], string>>;

const oneLine = (text: string | undefined) => (text ?? '').replace(/\s*[\r\n\v]+\s*/g, ' ').trim();

/**
 * The manifest of `folder`: each take in order, then its files; the slate's own files; then its
 * references in the order logged. A file whose bytes are not in the package (freed after Flow PT
 * kept them) is left out. Byte order mark for Excel, CRLF, cells a spreadsheet would run as a
 * formula kept as text. `kindLabel` gives a kind as the app shows it.
 */
export function slateManifest(folder: SlateFolder, kindLabel: (kind: string) => string): string {
	const rows: Row[] = [];
	for (const { row, files } of folder.takes) {
		const take: Row = {
			Take: row.take.take,
			Camera: row.cameraLetter,
			Clip: row.take.clipName,
			Roll: row.take.cameraRoll,
			'Timecode in': row.take.timecodeStart,
			'Timecode out': row.take.timecodeEnd
		};
		rows.push({ What: 'Take', ...take });
		for (const f of files) if (!f.pruned) rows.push({ What: WHAT[f.media], ...take, Name: f.name, Path: `${folder.name}/${f.name}`, Notes: oneLine(f.caption) });
	}
	for (const f of folder.files) if (!f.pruned) rows.push({ What: WHAT[f.media], Name: f.name, Path: `${folder.name}/${f.name}`, Notes: oneLine(f.caption) });
	for (const { reference: r, path } of folder.references) {
		rows.push({
			What: 'Reference',
			Kind: kindLabel(r.kind ?? ''),
			Name: oneLine(r.name),
			Path: path,
			Device: oneLine(r.device),
			'Card or roll': oneLine(r.cardOrRoll),
			Count: r.count === undefined ? '' : String(r.count),
			Notes: oneLine(r.notes)
		});
	}
	return csvText([[...MANIFEST_COLUMNS], ...rows.map((row) => MANIFEST_COLUMNS.map((c) => row[c] ?? ''))], { bom: true, guardFormulas: true });
}
