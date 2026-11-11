// Backup: every record and every file of a store as one zip, and the restore of it. The edge of
// the backup: streams, the zip writer, the sink. The archive layout is in `archive.ts`, the zip
// reader in `zipRead.ts`.
//
// Export streams. Rows are read a table at a time, files one at a time, and the zip leaves in
// chunks to a sink, so the archive is never held whole in memory when the sink writes to disk.
// Files are stored, not compressed: photos do not shrink.

import { makeZip } from 'client-zip';
import { blobPath, checkManifest, fromNdjson, MANIFEST_PATH, parsePath, tablePath, toNdjson, FORMAT, FORMAT_VERSION, type Manifest, type ManifestRefusal } from './archive';
import type { BackupSource, BackupTarget, BlobMeta } from './types';
import { entryBlob, entryCrc, readZip, ZipError, type ZipEntry } from './zipRead';

/**
 * - `notBackup`: not a zip, or not one of ours.
 * - `newerFormat`, `newerSchema`: made by a later version of the app. Update the app.
 * - `olderSchema`: made under an older schema; no migration for backups yet.
 * - `incomplete`: a table or a file the manifest counts is missing.
 * - `corrupt`: a file fails its checksum.
 * - `notEmpty`: the store holds data and `replace` was not asked for.
 */
export type BackupRefusal = ManifestRefusal | 'incomplete' | 'corrupt' | 'notEmpty';

export class BackupError extends Error {
	constructor(
		readonly reason: BackupRefusal,
		message: string = reason
	) {
		super(message);
		this.name = 'BackupError';
	}
}

/** Where the zip goes as it is made. */
export interface BackupSink {
	write(chunk: Uint8Array): Promise<void>;
	/** Ends the file and returns it. */
	close(): Promise<Blob>;
	/** Drops what was written. */
	abort(): Promise<void>;
}

/** The backup of `source` as a zip stream. `now`: the export time, in ms. */
export function exportBackup(source: BackupSource, options: { now: number }): ReadableStream<Uint8Array> {
	const lastModified = new Date(options.now);
	async function* files() {
		const tables: Record<string, number> = {};
		for (const name of source.tableNames()) {
			const rows = await source.rows(name);
			tables[name] = rows.length;
			yield { name: tablePath(name), lastModified, input: toNdjson(rows) };
		}
		let blobs = 0;
		for (const id of await source.blobIds()) {
			const blob = await source.blob(id);
			if (!blob) continue;
			blobs += 1;
			yield { name: blobPath(id), lastModified, input: blob };
		}
		const manifest: Manifest = {
			format: FORMAT,
			formatVersion: FORMAT_VERSION,
			schemaVersion: source.schemaVersion,
			exportedAt: lastModified.toISOString(),
			tables,
			blobs
		};
		yield { name: MANIFEST_PATH, lastModified, input: JSON.stringify(manifest, null, '\t') };
	}
	return makeZip(files());
}

/** Pumps the zip into the sink. Returns the finished file; on failure the sink is aborted. */
export async function saveBackup(zip: ReadableStream<Uint8Array>, sink: BackupSink): Promise<Blob> {
	const reader = zip.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			await sink.write(value);
		}
	} catch (error) {
		await sink.abort();
		throw error;
	}
	return sink.close();
}

/** Keeps the zip in memory. For tests, small stores, and browsers with no private file system. */
export function memorySink(): BackupSink {
	let chunks: Uint8Array[] = [];
	return {
		async write(chunk) {
			chunks.push(chunk);
		},
		async close() {
			return new Blob(chunks as BlobPart[], { type: 'application/zip' });
		},
		async abort() {
			chunks = [];
		}
	};
}

const OPFS_NAME = 'sg-onset-backup.zip';

/**
 * Writes the zip to the origin's private file system, so the archive is on disk, not in memory.
 * One file, overwritten by each export. Undefined where the browser cannot do it.
 */
export async function opfsSink(name: string = OPFS_NAME): Promise<BackupSink | undefined> {
	try {
		const root = await navigator.storage.getDirectory();
		const handle = await root.getFileHandle(name, { create: true });
		if (typeof handle.createWritable !== 'function') return undefined;
		const writable = await handle.createWritable();
		return {
			write: (chunk) => writable.write(chunk as Uint8Array<ArrayBuffer>),
			async close() {
				await writable.close();
				const file = await handle.getFile();
				return file.slice(0, file.size, 'application/zip');
			},
			async abort() {
				await writable.abort();
				await root.removeEntry(name).catch(() => undefined);
			}
		};
	} catch {
		return undefined;
	}
}

/** Frees the space of the last export, once it has been shared or saved. */
export async function removeExport(name: string = OPFS_NAME): Promise<void> {
	try {
		await (await navigator.storage.getDirectory()).removeEntry(name);
	} catch {
		// Nothing there.
	}
}

/** The backup as a file: on disk where the browser can, else in memory. Hand it to `shareOrDownload`. */
export async function backupToFile(source: BackupSource, options: { now: number }): Promise<Blob> {
	return saveBackup(exportBackup(source, options), (await opfsSink()) ?? memorySink());
}

export type ImportReport = { manifest: Manifest; tables: Record<string, number>; blobs: number };

/**
 * Restores a backup into `target`. The whole archive is checked first: manifest, every table,
 * every file against its checksum. Only then is the store touched. A store that holds data is
 * refused unless `replace` is set, and then it is emptied first.
 */
export async function importBackup(target: BackupTarget, file: Blob, options: { replace?: boolean } = {}): Promise<ImportReport> {
	let entries: ZipEntry[];
	try {
		entries = await readZip(file);
	} catch (error) {
		if (error instanceof ZipError) throw new BackupError('notBackup', error.message);
		throw error;
	}
	const tables = new Map<string, ZipEntry>();
	const blobs = new Map<string, ZipEntry>();
	let manifestEntry: ZipEntry | undefined;
	for (const entry of entries) {
		const path = parsePath(entry.name);
		if (path?.kind === 'manifest') manifestEntry = entry;
		if (path?.kind === 'table') tables.set(path.name, entry);
		if (path?.kind === 'blob') blobs.set(path.id, entry);
	}
	if (!manifestEntry) throw new BackupError('notBackup', 'no manifest');

	const text = async (entry: ZipEntry) => {
		try {
			return await (await entryBlob(file, entry)).text();
		} catch (error) {
			throw new BackupError('corrupt', String(error));
		}
	};
	let parsed: unknown;
	try {
		parsed = JSON.parse(await text(manifestEntry));
	} catch {
		throw new BackupError('notBackup', 'unreadable manifest');
	}
	const checked = checkManifest(parsed, target.schemaVersion);
	if (!checked.ok) throw new BackupError(checked.reason);
	const manifest = checked.manifest;

	const wanted = target.tableNames().filter((name) => name in manifest.tables);
	for (const name of Object.keys(manifest.tables)) {
		if (!tables.has(name)) throw new BackupError('incomplete', `table ${name} is missing`);
	}
	if (blobs.size !== manifest.blobs) throw new BackupError('incomplete', `${blobs.size} of ${manifest.blobs} files`);
	for (const entry of [...tables.values(), ...blobs.values()]) {
		let crc: number;
		try {
			crc = await entryCrc(file, entry);
		} catch (error) {
			throw new BackupError('corrupt', String(error));
		}
		if (crc !== entry.crc) throw new BackupError('corrupt', `${entry.name} fails its checksum`);
	}
	const rows = new Map<string, unknown[]>();
	for (const name of wanted) {
		try {
			rows.set(name, fromNdjson(await text(tables.get(name)!)));
		} catch {
			throw new BackupError('corrupt', `table ${name} is unreadable`);
		}
		if (rows.get(name)!.length !== manifest.tables[name]) throw new BackupError('incomplete', `table ${name} is short`);
	}

	if (!(await target.isEmpty())) {
		if (!options.replace) throw new BackupError('notEmpty');
		await target.clear();
	}

	const types = new Map(((rows.get('blobs') ?? []) as BlobMeta[]).map((info) => [info.id, info.type]));
	const report: ImportReport = { manifest, tables: {}, blobs: 0 };
	// Files first: a row is only written once the bytes it speaks of are in.
	for (const [id, entry] of blobs) {
		await target.putBlobData(id, await entryBlob(file, entry, types.get(id) ?? ''));
		report.blobs += 1;
	}
	for (const name of wanted) {
		await target.putRows(name, rows.get(name)!);
		report.tables[name] = rows.get(name)!.length;
	}
	return report;
}
