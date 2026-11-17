// What a wrap package holds, as data: the four exports at the root, then a folder per slate with
// its manifest, its files and an empty folder for each set reference shot on another device. No
// zipping here:
// the UI feeds the plan to the zip writer the backup uses (client-zip), making each text with the
// export modules and reading each stored file with `store.blob(id)`. Pure.
//
// The seam for later media: a take's files come from `takeFiles`, a slate's own from
// `slateFiles`. Add a kind of file there (and its name in naming.ts); the layout, the zip, the
// size, the notes and the manifest pick it up. See docs/export.md, "Adding a kind of file".

import type { Project, Reference, ShootDay, Slate } from '$lib/model/types';
import type { BlobMeta } from '$lib/store/types';
import { exportFileName, extensionFor, folderName, kindFolders, manifestFileName, packageName, photoFileName, slateFolderName, uniqueName } from './naming';
import { referencesBySlate, type FlatTake } from './selection';
import { slateManifest } from './slateManifest';

/** What the plan needs of a stored file: `BlobMeta` without the sync fields. */
export type PhotoBlob = Pick<BlobMeta, 'id' | 'recordId' | 'type' | 'size' | 'createdAt' | 'name' | 'prunedAt' | 'variant'>;

/**
 * What a file in a slate's folder is: a photo, or a photo's annotated copy, its drawing flattened
 * on it (#86). Audio notes (#89) of a take, and the setup diagram (#87) of a slate, add theirs.
 */
export type Media = 'photo' | 'annotated';

/** A file in a slate's folder: one of a take's, or the slate's own. Its bytes are a stored file. */
export type SlateFile = {
	media: Media;
	/** Its name in the slate's folder. */
	name: string;
	mime: string;
	size: number;
	/** The stored file, read with `store.blob(id)`. */
	blobId: string;
	/** The record it is the file of: a still. */
	recordId: string;
	/** The bytes left the device after Flow PT verified them: fetch them or skip the file. */
	pruned: boolean;
	/** What the manifest notes about it: a photo's caption. */
	caption?: string;
};

/** A take in its slate's folder, with its files. */
export type TakeFolder = { row: FlatTake; files: SlateFile[] };

/**
 * A set reference, with the empty folder that waits for its files, from the package root:
 * `42A/hdri-360/HDRI_0412/`. From the root, so another slate's manifest can point at it.
 */
export type ReferenceFolder = { reference: Reference; path: string };

/** A slate's folder: what the manifest of a slate lists, and where each thing sits. */
export type SlateFolder = {
	slate: Slate;
	/** The folder's name at the package root: `42A`. */
	name: string;
	/** Its takes in the package, in order, each with its files. */
	takes: TakeFolder[];
	/** The slate's own files, a take's none. None yet: the setup diagram (#87) goes here. */
	files: SlateFile[];
	/** Its set references, in the order logged. */
	references: ReferenceFolder[];
};

export type WrapEntry =
	| { kind: 'crif' | 'plainCsv' | 'ale' | 'json'; path: string; mime: string }
	/** A slate's manifest, made here. */
	| { kind: 'manifest'; path: string; mime: string; slateId: string; text: string }
	| ({ kind: 'file'; path: string; slateId: string; takeId?: string } & SlateFile)
	/** An empty folder. Its path ends in a slash. */
	| { kind: 'folder'; path: string };

export type WrapPlan = {
	/** The folder everything sits in. */
	root: string;
	entries: WrapEntry[];
	/** The slate folders, in order. */
	slates: SlateFolder[];
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
	/**
	 * The slates of the days picked, as `selectSlates` gives them, so a slate with set references
	 * and no take in the rows gets its folder too. Absent: the slates of the rows.
	 */
	slates?: readonly Slate[];
	/** The set references of those slates. Absent: those the rows carry. */
	references?: readonly Reference[];
	/** The project's own reference kinds, in the order added, for their folder names. */
	projectKinds?: readonly string[];
	/** A reference kind as the app shows it, for the manifests. Absent: the kind as stored. */
	kindLabel?: (kind: string) => string;
};

/** What `takeFiles` and `slateFiles` read. One per package: the photo numbers run across it. */
export type FileContext = {
	photos: boolean;
	/** The first stored file of each record: later ones are derived, such as a thumbnail. */
	firstBlob: Map<string, PhotoBlob>;
	/** The annotated copy of each photo that has one, by still id (#86). */
	annotated: Map<string, PhotoBlob>;
	/** The next photo number per slate and camera. */
	counters: Map<string, number>;
	/** Records with no stored file. */
	missing: string[];
};

const byAge = (a: PhotoBlob, b: PhotoBlob) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/** The first stored file of each record, by record id. A copy made from it never is. */
export function firstBlobs(blobs: readonly PhotoBlob[]): Map<string, PhotoBlob> {
	const first = new Map<string, PhotoBlob>();
	for (const b of [...blobs].sort(byAge)) if (b.variant === undefined && !first.has(b.recordId)) first.set(b.recordId, b);
	return first;
}

/**
 * The annotated copy of each photo, by still id: the newest. Pass only the copies that match
 * their drawing (`$lib/draw/markup` `currentFiles`).
 */
export function annotatedBlobs(blobs: readonly PhotoBlob[]): Map<string, PhotoBlob> {
	const copies = new Map<string, PhotoBlob>();
	for (const b of [...blobs].sort(byAge)) if (b.variant === 'annotated') copies.set(b.recordId, b);
	return copies;
}

/**
 * A take's files, as they sit in its slate's folder: its photos, named as CRIF names them and
 * numbered per slate and camera in take order, then the order taken. A photo's annotated copy
 * follows it, under its name with "-annotated" (#86). A later kind of file of a take (an audio
 * note) is added here.
 */
export function takeFiles(row: FlatTake, ctx: FileContext): SlateFile[] {
	const files: SlateFile[] = [];
	if (!ctx.photos) return files;
	const slate = row.slate.slateUID ?? '';
	for (const still of row.stills) {
		const blob = ctx.firstBlob.get(still.id);
		if (!blob) {
			ctx.missing.push(still.id);
			continue;
		}
		const key = `${row.slate.id}:${photoFileName(slate, row.cameraLetter, 0, '').toLowerCase()}`;
		const n = (ctx.counters.get(key) ?? 0) + 1;
		ctx.counters.set(key, n);
		files.push({
			media: 'photo',
			name: photoFileName(slate, row.cameraLetter, n, extensionFor(blob.type, blob.name)),
			mime: blob.type,
			size: blob.size,
			blobId: blob.id,
			recordId: still.id,
			pruned: blob.prunedAt !== undefined,
			...(still.caption ? { caption: still.caption } : {})
		});
		const copy = ctx.annotated.get(still.id);
		if (copy) {
			files.push({
				media: 'annotated',
				name: photoFileName(slate, row.cameraLetter, n, extensionFor(copy.type, copy.name), true),
				mime: copy.type,
				size: copy.size,
				blobId: copy.id,
				recordId: still.id,
				pruned: copy.prunedAt !== undefined,
				...(still.caption ? { caption: still.caption } : {})
			});
		}
	}
	return files;
}

/** A slate's own files, a take's none. None yet: the setup diagram (#87) is added here. */
export function slateFiles(_slate: Slate, _ctx: FileContext): SlateFile[] {
	return [];
}

type Group = { slate: Slate; rows: FlatTake[]; references: Reference[] };

/** The rows and references of each slate, in the order of `slates`, then of the rows. */
function groupBySlate(rows: readonly FlatTake[], options: WrapOptions): Group[] {
	const groups = new Map<string, Group>();
	const group = (slate: Slate) => groups.get(slate.id) ?? groups.set(slate.id, { slate, rows: [], references: [] }).get(slate.id)!;
	for (const slate of options.slates ?? []) group(slate);
	for (const row of rows) group(row.slate).rows.push(row);
	const refs = options.references ? referencesBySlate(options.references) : new Map(rows.map((r) => [r.slate.id, r.references]));
	for (const g of groups.values()) g.references = refs.get(g.slate.id) ?? [];
	return [...groups.values()].filter((g) => g.rows.length > 0 || g.references.length > 0);
}

/**
 * The plan of a wrap package for these rows. Layout:
 *
 *     <project>_<day>/
 *       <project>_<day>_camera-report.csv   CRIF
 *       <project>_<day>_all-fields.csv      plain CSV
 *       <project>_<day>_editorial.ale       ALE
 *       <project>_<day>_data.json           JSON
 *       <slate>/
 *         <slate>_manifest.csv              its takes, files and references
 *         <slate>-<camera>-reference-<n>.<ext>
 *         <slate>-<camera>-reference-<n>-annotated.jpg   the photo with its drawing (#86)
 *         <kind>/<reference>/               empty, for what was shot on another device
 *
 * A slate gets a folder when it has a take in the rows or a set reference. Names come from
 * naming.ts; two that would clash once unzipped on a system that ignores case are stepped `-2`.
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
	const ctx: FileContext = { photos: options.photos !== false, firstBlob: firstBlobs(options.blobs), annotated: annotatedBlobs(options.blobs), counters: new Map(), missing: [] };
	const groups = groupBySlate(rows, options);
	const kindFolder = kindFolders(
		groups.flatMap((g) => g.references.map((r) => r.kind ?? '')),
		options.projectKinds ?? []
	);
	const slateNames = new Set<string>();
	const slates: SlateFolder[] = [];
	for (const g of groups) {
		const name = uniqueName(slateFolderName(g.slate.slateUID), slateNames);
		const here = `${root}/${name}`;
		// Names in the slate's folder, and in each kind's folder in it.
		const taken = new Set<string>();
		const manifest = uniqueName(manifestFileName(name), taken);
		const claim = (f: SlateFile): SlateFile => {
			const dot = f.name.lastIndexOf('.');
			return { ...f, name: dot > 0 ? uniqueName(f.name.slice(0, dot), taken, f.name.slice(dot)) : uniqueName(f.name, taken) };
		};
		const takes = g.rows.map((row) => ({ row, files: takeFiles(row, ctx).map(claim) }));
		const own = slateFiles(g.slate, ctx).map(claim);
		const kinds = new Map<string, { name: string; taken: Set<string> }>();
		const references = g.references.map((reference) => {
			const wanted = kindFolder.get(reference.kind ?? '')!;
			let kind = kinds.get(wanted);
			if (!kind) kinds.set(wanted, (kind = { name: uniqueName(wanted, taken), taken: new Set() }));
			return { reference, path: `${name}/${kind.name}/${uniqueName(folderName(reference.name ?? '', 'reference'), kind.taken)}/` };
		});
		const folder: SlateFolder = { slate: g.slate, name, takes, files: own, references };
		slates.push(folder);
		entries.push({ kind: 'manifest', path: `${here}/${manifest}`, mime: 'text/csv', slateId: g.slate.id, text: slateManifest(folder, options.kindLabel ?? ((k) => k)) });
		for (const t of takes) for (const f of t.files) entries.push({ kind: 'file', path: `${here}/${f.name}`, slateId: g.slate.id, takeId: t.row.take.id, ...f });
		for (const f of own) entries.push({ kind: 'file', path: `${here}/${f.name}`, slateId: g.slate.id, ...f });
		for (const r of references) entries.push({ kind: 'folder', path: `${root}/${r.path}` });
	}
	return { root, entries, slates, missingPhotos: ctx.missing };
}
