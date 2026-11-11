// The plan of the zip: every file it will hold, in order, with its size, from the export modules'
// wrap plan and what was picked. Photos whose bytes left the device are left out and said. Pure:
// the zip is written by `zip.ts`.

import type { Project, ShootDay } from '$lib/model/types';
import { wrapPlan, type PhotoBlob } from '$lib/export/wrapPackage';
import type { FlatTake } from '$lib/export/selection';
import type { TextKind, WrapChoice } from './choice';
import { zipSize } from './estimate';

export type PackageEntry =
	| { kind: TextKind | 'report'; path: string; mime: string; size: number }
	| { kind: 'photo'; path: string; mime: string; size: number; blobId: string };

/** Photos on one take that are in Flow PT only: their bytes were freed after it verified them. */
export type PrunedTake = { takeId: string; slate: string; take: string; cameraLetter: string; count: number };

export type PackagePlan = {
	root: string;
	/** The zip's file name. */
	fileName: string;
	entries: PackageEntry[];
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
};

const encoder = new TextEncoder();

export function packagePlan(rows: readonly FlatTake[], choice: WrapChoice, sources: PackageSources): PackagePlan {
	const photos = choice.files.includes('photos');
	const plan = wrapPlan(rows, { project: sources.project, shootDays: sources.shootDays, blobs: sources.blobs, photos });
	const entries: PackageEntry[] = [];
	for (const e of plan.entries) {
		if (e.kind === 'photo') continue;
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
		if (e.kind !== 'photo') continue;
		if (e.pruned) {
			const row = byTake.get(e.takeId);
			const p = pruned.get(e.takeId) ?? { takeId: e.takeId, slate: row?.slate.slateUID ?? '', take: row?.take.take ?? '', cameraLetter: row?.cameraLetter ?? '', count: 0 };
			p.count += 1;
			pruned.set(e.takeId, p);
			continue;
		}
		photoBytes += e.size;
		entries.push({ kind: 'photo', path: e.path, mime: e.mime, size: e.size, blobId: e.blobId });
	}
	return { root: plan.root, fileName: `${plan.root}.zip`, entries, pruned: [...pruned.values()], missing: plan.missingPhotos, photoBytes, bytes: zipSize(entries) };
}
