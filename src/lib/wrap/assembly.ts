// The plan of the zip: every file and empty folder it will hold, in order, with its size, from the
// export modules' wrap plan and what was picked. Files whose bytes left the device are left out
// and said. Pure: the zip is written by `zip.ts`.

import type { Project, Reference, ShootDay, Slate } from '$lib/model/types';
import { wrapPlan, type Media, type PhotoBlob } from '$lib/export/wrapPackage';
import type { FlatTake } from '$lib/export/selection';
import type { TextKind, WrapChoice } from './choice';
import { zipSize } from './estimate';

export type PackageEntry =
	| { kind: TextKind | 'report'; path: string; mime: string; size: number }
	/** A stored file in a slate's folder, read with `store.blob(blobId)`. */
	| { kind: 'file'; media: Media; path: string; mime: string; size: number; blobId: string }
	/** An empty folder: its path ends in a slash, its size is 0. */
	| { kind: 'folder'; path: string; size: number };

/** Files on one take that are in Flow PT only: their bytes were freed after it verified them. */
export type PrunedTake = { takeId: string; slate: string; take: string; cameraLetter: string; count: number };

export type PackagePlan = {
	root: string;
	/** The zip's file name. */
	fileName: string;
	entries: PackageEntry[];
	/** The entries that are files, not folders. */
	files: number;
	pruned: PrunedTake[];
	/** Photos with no stored file at all, by id. */
	missing: string[];
	photoBytes: number;
	/** The size of the zip. */
	bytes: number;
};

export type PackageSources = {
	project: Project;
	shootDays: readonly ShootDay[];
	blobs: readonly PhotoBlob[];
	texts: Partial<Record<TextKind, string>>;
	/** The day report as a page that stands alone. */
	reportHtml?: string;
	/** The slates of the days picked, so one with set references and no take gets its folder. */
	slates?: readonly Slate[];
	/** Their set references. */
	references?: readonly Reference[];
	/** The project's own reference kinds, in the order added. */
	projectKinds?: readonly string[];
};

const encoder = new TextEncoder();

export function packagePlan(rows: readonly FlatTake[], choice: WrapChoice, sources: PackageSources): PackagePlan {
	const photos = choice.files.includes('photos');
	const plan = wrapPlan(rows, {
		project: sources.project,
		shootDays: sources.shootDays,
		blobs: sources.blobs,
		photos,
		slates: sources.slates,
		references: sources.references,
		projectKinds: sources.projectKinds
	});
	const entries: PackageEntry[] = [];
	for (const e of plan.entries) {
		if (e.kind === 'file' || e.kind === 'folder') continue;
		const text = sources.texts[e.kind];
		if (!choice.files.includes(e.kind) || text === undefined) continue;
		entries.push({ kind: e.kind, path: e.path, mime: e.mime, size: encoder.encode(text).length });
	}
	if (choice.files.includes('report') && sources.reportHtml !== undefined) {
		entries.push({ kind: 'report', path: `${plan.root}/${plan.root}_day-report.html`, mime: 'text/html', size: encoder.encode(sources.reportHtml).length });
	}
	const byTake = new Map(rows.map((r) => [r.take.id, r]));
	const pruned = new Map<string, PrunedTake>();
	let photoBytes = 0;
	for (const e of plan.entries) {
		if (e.kind === 'folder') {
			entries.push({ kind: 'folder', path: e.path, size: 0 });
			continue;
		}
		if (e.kind !== 'file') continue;
		if (e.pruned) {
			const takeId = e.takeId ?? '';
			const row = byTake.get(takeId);
			const p = pruned.get(takeId) ?? { takeId, slate: row?.slate.slateUID ?? '', take: row?.take.take ?? '', cameraLetter: row?.cameraLetter ?? '', count: 0 };
			p.count += 1;
			pruned.set(takeId, p);
			continue;
		}
		if (e.media === 'photo') photoBytes += e.size;
		entries.push({ kind: 'file', media: e.media, path: e.path, mime: e.mime, size: e.size, blobId: e.blobId });
	}
	return {
		root: plan.root,
		fileName: `${plan.root}.zip`,
		entries,
		files: entries.filter((e) => e.kind !== 'folder').length,
		pruned: [...pruned.values()],
		missing: plan.missingPhotos,
		photoBytes,
		bytes: zipSize(entries)
	};
}
