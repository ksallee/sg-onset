// What a wrap package holds, as data: the four exports and the photos, each with its path in the
// zip. No zipping here: the UI feeds the plan to the zip writer the backup uses (client-zip),
// making each text with the export modules and reading each photo with `store.blob(id)`. Pure.

import type { Project, ShootDay } from '$lib/model/types';
import type { BlobMeta } from '$lib/store/types';
import { exportFileName, extensionFor, packageName, photoFileName, slug } from './naming';
import type { FlatTake } from './selection';

/** What the plan needs of a stored file: `BlobMeta` without the sync fields. */
export type PhotoBlob = Pick<BlobMeta, 'id' | 'recordId' | 'type' | 'size' | 'createdAt' | 'name' | 'prunedAt' | 'variant'>;

export type WrapEntry =
	| { kind: 'crif' | 'plainCsv' | 'ale' | 'json'; path: string; mime: string }
	| {
			kind: 'photo';
			path: string;
			mime: string;
			blobId: string;
			stillId: string;
			takeId: string;
			size: number;
			/** The bytes left the device after Flow PT verified them: fetch them or skip the file. */
			pruned: boolean;
			/** The photo with its drawing flattened on it (#86), beside the photo itself. */
			annotated: boolean;
	  };

export type WrapPlan = {
	/** The folder everything sits in. */
	root: string;
	entries: WrapEntry[];
	/** Photos with no stored file at all. */
	missingPhotos: string[];
};

export type WrapOptions = {
	project: Project;
	/** The shoot days the package covers, for its name. */
	shootDays: readonly ShootDay[];
	/** The files of the photos, as `store.blobsOf(still.id)` returns them. */
	blobs: readonly PhotoBlob[];
	/** Include the photos. Default true. */
	photos?: boolean;
};

/**
 * The plan of a wrap package for these rows. Layout:
 *
 *     <project>_<day>/
 *       <project>_<day>_camera-report.csv   CRIF
 *       <project>_<day>_all-fields.csv      plain CSV
 *       <project>_<day>_editorial.ale       ALE
 *       <project>_<day>_data.json           JSON
 *       photos/<slate>/take-<take>/<slate>-<camera>-reference-<n>.<ext>
 *       photos/<slate>/take-<take>/<slate>-<camera>-reference-<n>-annotated.jpg
 *
 * Photos are numbered per slate and camera, in take order then the order taken, so each name is
 * unique in its slate as CRIF asks. A photo's own file is the first stored that is not a copy;
 * other plain files are derived, such as a thumbnail, and left out. An annotated copy (#86) goes
 * beside it under the same number: pass only the copies that match their drawing
 * (`$lib/draw/markup` `currentFiles`); of several, the newest goes.
 */
export function wrapPlan(rows: readonly FlatTake[], options: WrapOptions): WrapPlan {
	const root = packageName(options.project, options.shootDays);
	const file = (kind: Parameters<typeof exportFileName>[2]) => `${root}/${exportFileName(options.project, options.shootDays, kind)}`;
	const entries: WrapEntry[] = [
		{ kind: 'crif', path: file('camera-report'), mime: 'text/csv' },
		{ kind: 'plainCsv', path: file('all-fields'), mime: 'text/csv' },
		{ kind: 'ale', path: file('editorial'), mime: 'text/plain' },
		{ kind: 'json', path: file('data'), mime: 'application/json' }
	];
	const missingPhotos: string[] = [];
	if (options.photos === false) return { root, entries, missingPhotos };

	const firstBlob = new Map<string, PhotoBlob>();
	const copyOf = new Map<string, PhotoBlob>();
	for (const b of [...options.blobs].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))) {
		if (b.variant === 'annotated') copyOf.set(b.recordId, b);
		else if (!firstBlob.has(b.recordId)) firstBlob.set(b.recordId, b);
	}
	const counters = new Map<string, number>();
	for (const row of rows) {
		for (const still of row.stills) {
			const blob = firstBlob.get(still.id);
			if (!blob) {
				missingPhotos.push(still.id);
				continue;
			}
			const counterKey = `${row.slate.id}:${row.cameraLetter}`;
			const n = (counters.get(counterKey) ?? 0) + 1;
			counters.set(counterKey, n);
			const slate = row.slate.slateUID ?? '';
			const folder = `${root}/photos/${slug(slate.replace(/\s+/g, ''), 'slate')}/take-${slug(row.take.take ?? '', 'none')}`;
			const copy = copyOf.get(still.id);
			for (const file of copy ? [blob, copy] : [blob]) {
				const annotated = file === copy;
				entries.push({
					kind: 'photo',
					path: `${folder}/${photoFileName(slate, row.cameraLetter, n, extensionFor(file.type, file.name), annotated)}`,
					mime: file.type,
					blobId: file.id,
					stillId: still.id,
					takeId: row.take.id,
					size: file.size,
					pruned: file.prunedAt !== undefined,
					annotated
				});
			}
		}
	}
	return { root, entries, missingPhotos };
}
