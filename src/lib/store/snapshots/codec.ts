// A snapshot's bytes: the backup's layout (`archive.ts`) as a stored zip, `tables/<table>.ndjson`
// and `manifest.json`, with no `blobs/`. Gzipped when the browser can. The checks on read: the
// checksum of the stored bytes, every entry's checksum, the manifest, the counts.

import { checkManifest, FORMAT, FORMAT_VERSION, fromNdjson, MANIFEST_PATH, parsePath, tablePath, toNdjson, type Manifest } from '../archive';
import { crc32 } from '../crc32';
import { entryBlob, entryCrc, readZip } from '../zipRead';
import type { SnapshotEncoding, SnapshotMeta } from './types';
import { writeZip } from './zipWrite';

export class SnapshotCorrupt extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SnapshotCorrupt';
	}
}

export type Encoded = { bytes: Uint8Array; rawSize: number; encoding: SnapshotEncoding; crc: number; counts: Record<string, number> };

/** The rows as a stored zip, synchronously. */
export function encodeRows(rows: Record<string, readonly unknown[]>, info: { schemaVersion: number; at: number }): Omit<Encoded, 'crc'> {
	const encoder = new TextEncoder();
	const counts: Record<string, number> = {};
	const files = Object.entries(rows).map(([name, list]) => {
		counts[name] = list.length;
		return { name: tablePath(name), data: encoder.encode(toNdjson(list)) };
	});
	const manifest: Manifest = {
		format: FORMAT,
		formatVersion: FORMAT_VERSION,
		schemaVersion: info.schemaVersion,
		exportedAt: new Date(info.at).toISOString(),
		tables: counts,
		blobs: 0
	};
	files.push({ name: MANIFEST_PATH, data: encoder.encode(JSON.stringify(manifest)) });
	const bytes = writeZip(files, new Date(info.at));
	return { bytes, rawSize: bytes.length, encoding: 'zip', counts };
}

export function canGzip(): boolean {
	return typeof CompressionStream === 'function';
}

async function pipe(bytes: Uint8Array, through: ReadableWritablePair<Uint8Array, Uint8Array>): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(through);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Gzips the zip where the browser can. */
export async function compress(zip: Omit<Encoded, 'crc'>): Promise<Encoded> {
	if (!canGzip()) return { ...zip, crc: crc32(zip.bytes) };
	const bytes = await pipe(zip.bytes, new CompressionStream('gzip') as ReadableWritablePair<Uint8Array, Uint8Array>);
	return { ...zip, bytes, encoding: 'zip+gzip', crc: crc32(bytes) };
}

/** The snapshot as a backup zip, with no files. Checks the stored bytes first. */
export async function snapshotZip(meta: Pick<SnapshotMeta, 'crc' | 'encoding'>, data: Blob): Promise<Blob> {
	const stored = new Uint8Array(await data.arrayBuffer());
	if (crc32(stored) !== meta.crc) throw new SnapshotCorrupt('the stored bytes fail their checksum');
	if (meta.encoding === 'zip') return new Blob([stored as BlobPart], { type: 'application/zip' });
	try {
		const zip = await pipe(stored, new DecompressionStream('gzip') as ReadableWritablePair<Uint8Array, Uint8Array>);
		return new Blob([zip as BlobPart], { type: 'application/zip' });
	} catch (error) {
		throw new SnapshotCorrupt(`unreadable: ${String(error)}`);
	}
}

/** Every row of the snapshot, after every check. Throws `SnapshotCorrupt`. */
export async function decodeSnapshot(meta: Pick<SnapshotMeta, 'crc' | 'encoding' | 'counts' | 'schemaVersion'>, data: Blob): Promise<Record<string, unknown[]>> {
	const zip = await snapshotZip(meta, data);
	try {
		const entries = await readZip(zip);
		const rows: Record<string, unknown[]> = {};
		let manifest: unknown;
		for (const entry of entries) {
			if ((await entryCrc(zip, entry)) !== entry.crc) throw new SnapshotCorrupt(`${entry.name} fails its checksum`);
			const path = parsePath(entry.name);
			const text = await (await entryBlob(zip, entry)).text();
			if (path?.kind === 'manifest') manifest = JSON.parse(text);
			if (path?.kind === 'table') rows[path.name] = fromNdjson(text);
		}
		const checked = checkManifest(manifest, meta.schemaVersion);
		if (!checked.ok) throw new SnapshotCorrupt(`manifest: ${checked.reason}`);
		for (const [name, count] of Object.entries(meta.counts)) {
			if (rows[name]?.length !== count || checked.manifest.tables[name] !== count) throw new SnapshotCorrupt(`table ${name} does not hold ${count} rows`);
		}
		return rows;
	} catch (error) {
		if (error instanceof SnapshotCorrupt) throw error;
		throw new SnapshotCorrupt(String(error));
	}
}
