// The layout of a backup archive: which file holds what, and the manifest. Pure.
//
//   tables/<table>.ndjson   one JSON row per line: the record tables and the store's own
//   blobs/<blob id>         the bytes of each file, as captured
//   manifest.json           written last: an archive without it was cut short

export const FORMAT = 'sg-onset-backup';
export const FORMAT_VERSION = 1;
export const MANIFEST_PATH = 'manifest.json';

export type Manifest = {
	format: typeof FORMAT;
	formatVersion: number;
	/** The store's schema version the rows were written under. */
	schemaVersion: number;
	/** ISO 8601, UTC. */
	exportedAt: string;
	/** Rows per table. */
	tables: Record<string, number>;
	/** Files under `blobs/`. */
	blobs: number;
};

export function tablePath(name: string): string {
	return `tables/${name}.ndjson`;
}

export function blobPath(id: string): string {
	return `blobs/${encodeURIComponent(id)}`;
}

export type ArchivePath = { kind: 'manifest' } | { kind: 'table'; name: string } | { kind: 'blob'; id: string };

/** What a path in the archive holds. Undefined for anything that is not ours. */
export function parsePath(path: string): ArchivePath | undefined {
	if (path === MANIFEST_PATH) return { kind: 'manifest' };
	const table = /^tables\/([^/]+)\.ndjson$/.exec(path);
	if (table) return { kind: 'table', name: table[1] };
	const blob = /^blobs\/([^/]+)$/.exec(path);
	if (!blob) return undefined;
	try {
		return { kind: 'blob', id: decodeURIComponent(blob[1]) };
	} catch {
		return undefined;
	}
}

export function toNdjson(rows: readonly unknown[]): string {
	return rows.map((row) => JSON.stringify(row) + '\n').join('');
}

export function fromNdjson(text: string): unknown[] {
	return text
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => JSON.parse(line));
}

export type ManifestRefusal = 'notBackup' | 'newerFormat' | 'newerSchema' | 'olderSchema';

/**
 * Can a store at `schemaVersion` take this backup. An older schema is refused for now: there is
 * one version, and a row migration for backups comes with the second.
 */
export function checkManifest(
	value: unknown,
	schemaVersion: number
): { ok: true; manifest: Manifest } | { ok: false; reason: ManifestRefusal } {
	const m = value as Partial<Manifest> | null;
	const shaped =
		!!m &&
		typeof m === 'object' &&
		m.format === FORMAT &&
		typeof m.formatVersion === 'number' &&
		typeof m.schemaVersion === 'number' &&
		typeof m.blobs === 'number' &&
		!!m.tables &&
		typeof m.tables === 'object';
	if (!shaped) return { ok: false, reason: 'notBackup' };
	if (m.formatVersion! > FORMAT_VERSION) return { ok: false, reason: 'newerFormat' };
	if (m.schemaVersion! > schemaVersion) return { ok: false, reason: 'newerSchema' };
	if (m.schemaVersion! < schemaVersion) return { ok: false, reason: 'olderSchema' };
	return { ok: true, manifest: m as Manifest };
}
