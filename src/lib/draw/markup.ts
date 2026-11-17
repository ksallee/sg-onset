// A photo's drawing (#86): the shapes drawn over a still, kept as data beside it in the `markup`
// table, on the device. The photo's own file is never touched. Flow PT and the wrap package also get
// a flattened copy, the photo with the drawing painted on it: a second file of the still, marked
// `annotated`, and named with an "-annotated" suffix where it lands. The copy carries the key of the
// drawing it was made from, so a copy that no longer matches the drawing is known. Pure.

import { crc32 } from '$lib/store/crc32';
import { isBlank, type Drawing } from './drawing';

/** One still's drawing. `width` and `height` are the photo's pixels: the shapes are in them. */
export type Markup = Drawing & { id: string; stillId: string };

/** What the plan needs of a stored file: `BlobMeta` without the bytes' details. */
export type FileInfo = {
	id: string;
	recordId: string;
	createdAt: number;
	variant?: 'annotated';
	/** For an annotated copy: the key of the drawing it was made from. */
	source?: string;
	verifiedAt?: number;
	prunedAt?: number;
};

/** A short fingerprint of a drawing: the same drawing, the same key. */
export function markupKey(drawing: Drawing): string {
	const text = JSON.stringify({ width: drawing.width, height: drawing.height, shapes: drawing.shapes });
	return crc32(new TextEncoder().encode(text)).toString(16).padStart(8, '0');
}

const byAge = (a: FileInfo, b: FileInfo) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/** The photo itself: the first file stored that is not a copy. */
export function originalFile<F extends FileInfo>(files: readonly F[]): F | undefined {
	return [...files].sort(byAge).find((f) => f.variant === undefined);
}

/** The annotated copy made from the drawing as it is now, if there is one. None for a blank drawing. */
export function annotatedFile<F extends FileInfo>(markup: Drawing | undefined, files: readonly F[]): F | undefined {
	if (!markup || isBlank(markup)) return undefined;
	const key = markupKey(markup);
	return [...files]
		.sort(byAge)
		.reverse()
		.find((f) => f.variant === 'annotated' && f.source === key);
}

/**
 * What to do so the still's annotated copy matches its drawing: `make` a copy from the drawing of
 * that key, and `drop` the copies that no longer match and have not been seen on Flow PT. The
 * store refuses to drop one whose upload has left; that one stays where it landed.
 */
export function flattenPlan(markup: Drawing | undefined, files: readonly FileInfo[]): { make?: string; drop: string[] } {
	const current = annotatedFile(markup, files);
	const drop = files.filter((f) => f.variant === 'annotated' && f !== current && f.verifiedAt === undefined && f.prunedAt === undefined).map((f) => f.id);
	const original = originalFile(files);
	const wanted = markup && !isBlank(markup) && !current && original && original.prunedAt === undefined;
	return wanted ? { make: markupKey(markup), drop } : { drop };
}

/** The files to hand over: every photo's own file, and each annotated copy that matches its drawing. */
export function currentFiles<F extends FileInfo>(files: readonly F[], markups: readonly Markup[]): F[] {
	const byStill = new Map(markups.map((m) => [m.stillId, m]));
	const keep = new Set<F>();
	for (const f of files) if (f.variant === undefined) keep.add(f);
	for (const stillId of new Set(files.map((f) => f.recordId))) {
		const copy = annotatedFile(
			byStill.get(stillId),
			files.filter((f) => f.recordId === stillId)
		);
		if (copy) keep.add(copy);
	}
	return files.filter((f) => keep.has(f));
}
